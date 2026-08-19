import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BadRequestError } from '../../shared/errors/AppError.js';

const tokenSchema = z.object({ fcmToken: z.string().min(1, 'FCM token is required') });

export const notificationsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preValidation', app.authenticate);

  // Register or replace the caller's FCM token for push notifications
  app.post('/token', async (request, reply) => {
    const parsed = tokenSchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);

    await app.prisma.user.update({
      where: { id: request.user.userId },
      data: { fcmToken: parsed.data.fcmToken },
    });
    return reply.send({ ok: true, message: 'Push token registered' });
  });

  // Remove FCM token on logout / permission revoked
  app.delete('/token', async (request, reply) => {
    await app.prisma.user.update({
      where: { id: request.user.userId },
      data: { fcmToken: null },
    });
    return reply.send({ ok: true, message: 'Push token removed' });
  });
};
