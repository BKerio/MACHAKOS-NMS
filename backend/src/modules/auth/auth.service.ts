import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { hashPassword, comparePassword } from '../../shared/utils/hash.js';
import { Role } from '../../shared/types/index.js';
import { AppError, UnauthorizedError, ConflictError, BadRequestError, NotFoundError } from '../../shared/errors/AppError.js';
import { normalizeKenyanMobile, sendAdvantaSms } from '../../services/sms.js';
import { getOtpStore } from './otp.store.js';

// Field-crew roles that sign in with phone + SMS code instead of email + password.
const OTP_ELIGIBLE_ROLES: Role[] = [Role.DRIVER, Role.EMT, Role.NURSE];
const OTP_TTL_SECONDS = 300; // code lifetime
const OTP_COOLDOWN_SECONDS = 60; // minimum gap between resend requests
const OTP_MAX_ATTEMPTS = 5; // wrong guesses allowed before the code is invalidated

interface OtpRecord {
  codeHash: string;
  userId: string;
  attempts: number;
}

export class AuthService {
  constructor(private app: FastifyInstance) {}

  /**
   * Registers a new user.
   */
  async register(data: { email: string; passwordRaw: string; name: string; role: Role; agencyId: string; phone?: string }) {
    // 1. Check if user exists
    const existingUser = await this.app.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // 2. Validate agency
    const agency = await this.app.prisma.agency.findUnique({
      where: { id: data.agencyId },
    });

    if (!agency) {
      throw new BadRequestError('Invalid agency ID');
    }

    // 3. Hash password
    const passwordHash = await hashPassword(data.passwordRaw);

    // 4. Create user
    const user = await this.app.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        role: data.role,
        agencyId: data.agencyId,
        phone: data.phone,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        agencyId: true,
        createdAt: true,
      },
    });

    return user;
  }

  /**
   * Logs in a user. Accounts with a single role get a full token right away.
   * Accounts holding more than one role instead get a short-lived pending
   * token that only authorizes POST /auth/select-role - the caller must pick
   * which role to activate before getting real access.
   */
  async login(data: { email: string; passwordRaw: string }) {
    // 1. Find user
    const user = await this.app.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // 2. Compare password
    const isPasswordValid = await comparePassword(data.passwordRaw, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Drivers/EMTs/Nurses sign in with phone + SMS code now - point them there
    // instead of letting a stale password in.
    const roles = user.roles.length ? user.roles : [user.role];
    if (roles.some((r) => OTP_ELIGIBLE_ROLES.includes(r))) {
      throw new UnauthorizedError('Drivers, EMTs, and Nurses now sign in with a phone number and SMS code. Use Field Crew Login.');
    }

    return this.issueSession(user);
  }

  /**
   * Shared by password login and OTP login - decides between a full token
   * and a pending role-selection token for multi-role accounts.
   */
  private issueSession(user: {
    id: string; email: string; name: string; role: Role; roles: Role[]; agencyId: string;
  }) {
    const roles = user.roles.length ? user.roles : [user.role];

    if (roles.length > 1) {
      const pendingToken = this.app.jwt.sign(
        { userId: user.id, role: roles[0], agencyId: user.agencyId, pending: true },
        { expiresIn: '10m' }
      );

      return {
        requiresRoleSelection: true as const,
        pendingToken,
        roles,
        user: { id: user.id, email: user.email, name: user.name },
      };
    }

    const token = this.app.jwt.sign({
      userId: user.id,
      role: user.role,
      agencyId: user.agencyId,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        roles,
        activeRole: user.role,
        agencyId: user.agencyId,
      },
    };
  }

  /**
   * Step 1 of field-crew login: finds the Driver/EMT/Nurse account with this
   * phone number, texts them a 6-digit code (via Advanta SMS), and stashes
   * the code hash for 5 minutes. Rate-limited to one send per minute per
   * phone number.
   */
  async requestOtp(phoneRaw: string) {
    const phone = normalizeKenyanMobile(phoneRaw);
    if (!phone) throw new BadRequestError('Enter a valid phone number');

    const store = getOtpStore(this.app);

    const cooldownKey = `otp:cooldown:${phone}`;
    if (await store.get(cooldownKey)) {
      throw new BadRequestError('A code was already sent - wait a minute before requesting another.');
    }

    const candidates = await this.app.prisma.user.findMany({
      where: {
        isActive: true,
        phone: { not: null },
        OR: [{ role: { in: OTP_ELIGIBLE_ROLES } }, { roles: { hasSome: OTP_ELIGIBLE_ROLES } }],
      },
    });
    const user = candidates.find((u) => u.phone && normalizeKenyanMobile(u.phone) === phone);

    if (!user) {
      throw new UnauthorizedError('No Driver, EMT, or Nurse account found with that phone number');
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await hashPassword(code);
    const record: OtpRecord = { codeHash, userId: user.id, attempts: 0 };

    const otpKey = `otp:${phone}`;
    await store.set(otpKey, JSON.stringify(record), OTP_TTL_SECONDS);
    await store.set(cooldownKey, '1', OTP_COOLDOWN_SECONDS);

    try {
      await sendAdvantaSms(phone, `Your NMS login code is ${code}. It expires in 5 minutes. Do not share this code.`);
    } catch (err) {
      // The code is worthless if the text never left, and keeping the cooldown
      // would lock them out for a minute over a gateway fault they can't fix.
      await store.del(otpKey, cooldownKey);
      this.app.log.error({ err, phone }, 'OTP SMS send failed');
      throw new AppError('We could not send the SMS just now. Please try again in a moment.', 502);
    }

    return { ok: true, expiresIn: OTP_TTL_SECONDS };
  }

  /**
   * Step 2 of field-crew login: checks the code against the stored hash and,
   * on success, issues the same session shape as password login.
   */
  async verifyOtp(phoneRaw: string, code: string) {
    const phone = normalizeKenyanMobile(phoneRaw);
    if (!phone) throw new BadRequestError('Enter a valid phone number');

    const store = getOtpStore(this.app);

    const otpKey = `otp:${phone}`;
    const raw = await store.get(otpKey);
    if (!raw) throw new UnauthorizedError('Code expired or was never requested - request a new one');

    const record = JSON.parse(raw) as OtpRecord;

    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await store.del(otpKey);
      throw new UnauthorizedError('Too many incorrect attempts - request a new code');
    }

    const isValid = await comparePassword(code, record.codeHash);
    if (!isValid) {
      await store.setKeepingTtl(otpKey, JSON.stringify({ ...record, attempts: record.attempts + 1 }));
      throw new UnauthorizedError('Incorrect code');
    }

    await store.del(otpKey);

    const user = await this.app.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || !user.isActive) throw new UnauthorizedError('Account is no longer active');

    return this.issueSession(user);
  }

  /**
   * Second step of login for multi-role accounts: exchanges a pending token
   * plus a chosen role (which must be one of the account's assigned roles)
   * for a full access token scoped to that role.
   */
  async selectRole(userId: string, role: Role) {
    const user = await this.app.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedError('Invalid session');
    }

    const roles = user.roles.length ? user.roles : [user.role];
    if (!roles.includes(role)) {
      throw new BadRequestError('That role is not assigned to this account');
    }

    const token = this.app.jwt.sign({
      userId: user.id,
      role,
      agencyId: user.agencyId,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role,
        roles,
        activeRole: role,
        agencyId: user.agencyId,
      },
    };
  }

  /**
   * Returns the signed-in user's own profile (self-service - no admin scope required).
   */
  async getProfile(userId: string) {
    const user = await this.app.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, phone: true, role: true, roles: true,
        agencyId: true, isActive: true, createdAt: true, updatedAt: true,
        agency: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundError('User');
    return user;
  }

  /**
   * Lets the signed-in user update their own name/phone, and optionally
   * change their password (requires the current password). Deliberately
   * excludes email/role/agency/isActive - those stay admin-only (see
   * AdminService.updateUser).
   */
  async updateProfile(
    userId: string,
    data: { name?: string; phone?: string; currentPassword?: string; newPassword?: string }
  ) {
    const user = await this.app.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    let passwordHash: string | undefined;
    if (data.newPassword) {
      const isCurrentValid = await comparePassword(data.currentPassword ?? '', user.passwordHash);
      if (!isCurrentValid) throw new UnauthorizedError('Current password is incorrect');
      passwordHash = await hashPassword(data.newPassword);
    }

    return this.app.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        agencyId: true, isActive: true, createdAt: true, updatedAt: true,
      },
    });
  }
}
