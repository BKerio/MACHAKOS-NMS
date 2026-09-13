import { FastifyInstance } from 'fastify';
import { PushGatewayService } from '../settings/push-gateway.service.js';

/** FCM's own error code for a token that's expired/uninstalled - safe to drop. */
const STALE_TOKEN_ERROR = /registration-token-not-registered|invalid-registration-token/i;

/**
 * Sends a push notification to one or more users' registered devices
 * (User.fcmToken), via whichever Firebase gateway Settings has marked
 * active. A no-op (not an error) when push isn't configured/active, or none
 * of the given users have a token - callers don't need to check first, same
 * as how crew SMS notifications are fire-and-forget.
 */
export class PushSenderService {
  private pushGateway: PushGatewayService;

  constructor(private app: FastifyInstance) {
    this.pushGateway = new PushGatewayService(app);
  }

  async sendToUsers(userIds: (string | null | undefined)[], title: string, body: string, data?: Record<string, string>): Promise<void> {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return;

    const client = await this.pushGateway.getActiveClient();
    if (!client) return;

    try {
      const users = await this.app.prisma.user.findMany({
        where: { id: { in: ids }, fcmToken: { not: null } },
        select: { id: true, fcmToken: true },
      });
      const tokens = users.map((u) => u.fcmToken).filter((t): t is string => Boolean(t));
      if (tokens.length === 0) return;

      const results = await client.sendMulticast(tokens, title, body, data);

      // Clear tokens FCM says are dead, so future sends don't keep retrying them.
      const stale = results.filter((r) => !r.success && STALE_TOKEN_ERROR.test(r.error ?? '')).map((r) => r.token);
      if (stale.length > 0) {
        await this.app.prisma.user.updateMany({ where: { fcmToken: { in: stale } }, data: { fcmToken: null } });
      }
    } catch (err) {
      this.app.log.error({ err }, 'Push notification send errored');
    } finally {
      await client.close();
    }
  }
}
