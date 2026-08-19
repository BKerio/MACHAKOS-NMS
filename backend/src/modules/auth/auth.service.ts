import { FastifyInstance } from 'fastify';
import { hashPassword, comparePassword } from '../../shared/utils/hash.js';
import { Role } from '../../shared/types/index.js';
import { UnauthorizedError, ConflictError, BadRequestError, NotFoundError } from '../../shared/errors/AppError.js';

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

    // 3. Generate token
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
