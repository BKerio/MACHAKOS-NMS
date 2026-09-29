import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { Role } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  passwordRaw: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.nativeEnum(Role),
  agencyId: z.string().min(1, 'Agency ID is required'),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  passwordRaw: z.string().min(1, 'Password is required'),
});

const selectRoleSchema = z.object({
  role: z.nativeEnum(Role),
});

const otpRequestSchema = z.object({
  phone: z.string().min(9, 'Enter a valid phone number'),
});

const otpVerifySchema = z.object({
  phone: z.string().min(9, 'Enter a valid phone number'),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

const googleLoginSchema = z.object({
  idToken: z.string().min(20, 'Google ID token is required'),
});

const biometricEnrollSchema = z.object({
  deviceName: z.string().max(80).optional(),
  replaceKeyId: z.string().max(64).optional(),
});

const biometricLoginSchema = z.object({
  keyId: z.string().min(1).max(64),
  secret: z.string().min(32).max(128),
});

const updateMeSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    phone: z.string().optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').optional(),
  })
  .refine((data) => !data.newPassword || !!data.currentPassword, {
    message: 'Current password is required to set a new password',
    path: ['currentPassword'],
  });

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const authService = new AuthService(app);

  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0].message);
    }

    const user = await authService.register(parsed.data);
    return reply.status(201).send({ ok: true, data: user });
  });

  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0].message);
    }

    const result = await authService.login(parsed.data);
    return reply.send({ ok: true, data: result });
  });

  // Field crew (Driver/EMT/Nurse) login: phone + SMS code, in place of a password.
  app.post('/otp/request', async (request, reply) => {
    const parsed = otpRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0].message);
    }

    const result = await authService.requestOtp(parsed.data.phone);
    return reply.send({ ok: true, data: result });
  });

  app.post('/otp/verify', async (request, reply) => {
    const parsed = otpVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0].message);
    }

    const result = await authService.verifyOtp(parsed.data.phone, parsed.data.code);
    return reply.send({ ok: true, data: result });
  });

  // Field crew: Google ID token → same JWT session as OTP (onboarded email only).
  app.post('/google', async (request, reply) => {
    const parsed = googleLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0].message);
    }

    const result = await authService.loginWithGoogle(parsed.data.idToken);
    return reply.send({ ok: true, data: result });
  });

  // Field crew: fingerprint sign-in with a device key set up from Settings.
  app.post('/biometric/login', async (request, reply) => {
    const parsed = biometricLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError('Fingerprint sign-in is not set up correctly. Sign in with an SMS code.');
    }

    const result = await authService.loginWithBiometric(parsed.data.keyId, parsed.data.secret);
    return reply.send({ ok: true, data: result });
  });

  app.post('/biometric/enroll', { preValidation: [app.authenticate] }, async (request, reply) => {
    const parsed = biometricEnrollSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0].message);
    }

    const result = await authService.enrollBiometric(request.user.userId, parsed.data.deviceName, parsed.data.replaceKeyId);
    return reply.status(201).send({ ok: true, data: result });
  });

  app.delete<{ Params: { keyId: string } }>('/biometric/:keyId', { preValidation: [app.authenticate] }, async (request, reply) => {
    await authService.revokeBiometric(request.user.userId, request.params.keyId);
    return reply.send({ ok: true, data: null });
  });

  app.post('/select-role', { preValidation: [app.authenticatePending] }, async (request, reply) => {
    const parsed = selectRoleSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0].message);
    }

    const result = await authService.selectRole(request.user.userId, parsed.data.role);
    return reply.send({ ok: true, data: result });
  });

  app.get('/me', { preValidation: [app.authenticate] }, async (request, reply) => {
    const profile = await authService.getProfile(request.user.userId);
    return reply.send({ ok: true, data: profile });
  });

  app.patch('/me', { preValidation: [app.authenticate] }, async (request, reply) => {
    const parsed = updateMeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0].message);
    }

    const user = await authService.updateProfile(request.user.userId, parsed.data);
    return reply.send({ ok: true, data: user });
  });
};
