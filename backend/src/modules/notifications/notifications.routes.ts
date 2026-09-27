import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BadRequestError } from '../../shared/errors/AppError.js';
import { PushSenderService } from './push-sender.service.js';

const platforms = ['ANDROID', 'IOS', 'WEB', 'UNKNOWN'] as const;

const tokenSchema = z.object({
  fcmToken: z.string().min(1, 'FCM token is required'),
  platform: z.string().optional(),
});
const removeSchema = z.object({ fcmToken: z.string().min(1).optional() }).optional();

function normalisePlatform(p: string | undefined): (typeof platforms)[number] {
  const up = (p ?? '').toUpperCase();
  return (platforms as readonly string[]).includes(up) ? (up as (typeof platforms)[number]) : 'UNKNOWN';
}

export const notificationsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const pushSender = new PushSenderService(app);

  app.addHook('preValidation', app.authenticate);

  /**
   * POST /notifications/token { fcmToken, platform? }
   * Registers this device for the caller. Each device keeps its own row, so a
   * crew member's phone and browser both get alerts. A token already held by
   * someone else (shared phone, new sign-in) moves to the caller.
   */
  app.post('/token', async (request, reply) => {
    const parsed = tokenSchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);
    const { fcmToken } = parsed.data;
    const platform = normalisePlatform(parsed.data.platform);

    await app.prisma.pushToken.upsert({
      where: { token: fcmToken },
      create: { token: fcmToken, platform, userId: request.user.userId },
      update: { platform, userId: request.user.userId },
    });
    return reply.send({ ok: true, message: 'Push token registered' });
  });

  /**
   * DELETE /notifications/token { fcmToken? }
   * With a token: forget just that device (logout on one device must not
   * silence the others). Without one (older app builds): forget all of the
   * caller's devices, as before.
   */
  app.delete('/token', async (request, reply) => {
    const parsed = removeSchema.safeParse(request.body ?? undefined);
    const token = parsed.success ? parsed.data?.fcmToken : undefined;
    await app.prisma.pushToken.deleteMany({
      where: token ? { token, userId: request.user.userId } : { userId: request.user.userId },
    });
    return reply.send({ ok: true, message: 'Push token removed' });
  });

  /**
   * POST /notifications/test
   * Sends a test alert to every device the caller has registered, and says
   * plainly why if it can't (push switched off, no device registered, or
   * Firebase rejected it).
   */
  app.post('/test', async (request, reply) => {
    const summary = await pushSender.sendToUsers(
      [request.user.userId],
      'Test alert',
      'Case alerts are reaching this device.',
      { type: 'TEST' },
    );
    if (!summary.gatewayActive) {
      throw new BadRequestError('Push notifications are switched off. An admin can turn them on in Settings > Push Notifications.');
    }
    if (summary.devices === 0) {
      throw new BadRequestError('This device is not registered for alerts yet. Sign out and back in, and allow notifications.');
    }
    if (summary.sent === 0) {
      throw new BadRequestError(`Firebase did not accept the alert: ${summary.errors[0] ?? 'unknown error'}`);
    }
    return reply.send({ ok: true, data: { devices: summary.devices, sent: summary.sent, failed: summary.failed } });
  });
};
