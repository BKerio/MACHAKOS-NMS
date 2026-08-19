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
