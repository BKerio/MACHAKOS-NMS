import { FastifyInstance } from 'fastify';
import { PushGatewayService } from '../settings/push-gateway.service.js';

/** FCM's own error code for a token that's expired/uninstalled - safe to drop. */
const STALE_TOKEN_ERROR = /registration-token-not-registered|invalid-registration-token|not a valid FCM registration token/i;

export interface PushSendSummary {
  /** False when push isn't configured or is switched off in Settings. */
  gatewayActive: boolean;
  /** Devices targeted (every registered device of every recipient). */
  devices: number;
  sent: number;
  failed: number;
  errors: string[];
}

/**
 * Sends a push notification to every registered device of one or more users
 * (PushToken rows - the crew app and the web dashboard each register their
 * own), via whichever Firebase gateway Settings has marked active. A no-op
 * (not an error) when push isn't configured/active or nobody has a device -
 * callers don't need to check first, same as crew SMS notifications.
 */
export class PushSenderService {
  private pushGateway: PushGatewayService;

  constructor(private app: FastifyInstance) {
    this.pushGateway = new PushGatewayService(app);
  }

  /**
   * Sends to every active dispatcher, admin and super admin - the people
   * watching the operation. Includes accounts that hold one of those roles
   * as their second role. Fire-and-forget friendly: never throws.
   */
  async sendToCommand(title: string, body: string, data?: Record<string, string>): Promise<PushSendSummary> {
    try {
      const command = ['DISPATCHER', 'ADMIN', 'SUPER_ADMIN'] as const;
      const users = await this.app.prisma.user.findMany({
        where: {
          isActive: true,
          OR: [{ role: { in: [...command] } }, { roles: { hasSome: [...command] } }],
        },
        select: { id: true },
      });
      return await this.sendToUsers(users.map((u) => u.id), title, body, data);
    } catch (err) {
      this.app.log.warn({ err, title }, 'Command push failed');
      return { gatewayActive: false, devices: 0, sent: 0, failed: 0, errors: [String(err)] };
    }
  }

  async sendToUsers(
    userIds: (string | null | undefined)[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<PushSendSummary> {
    const summary: PushSendSummary = { gatewayActive: false, devices: 0, sent: 0, failed: 0, errors: [] };
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return summary;

    const client = await this.pushGateway.getActiveClient();
    if (!client) return summary;
    summary.gatewayActive = true;

    try {
      const rows = await this.app.prisma.pushToken.findMany({
        where: { userId: { in: ids } },
        select: { token: true },
      });
      const tokens = [...new Set(rows.map((r) => r.token))];
      summary.devices = tokens.length;
      if (tokens.length === 0) return summary;

      // FCM multicast takes at most 500 tokens per call.
      for (let i = 0; i < tokens.length; i += 500) {
        const results = await client.sendMulticast(tokens.slice(i, i + 500), title, body, data);
        for (const r of results) {
          if (r.success) summary.sent++;
          else summary.failed++;
        }

        // Drop tokens FCM says are dead, so future sends don't keep retrying them.
        const stale = results.filter((r) => !r.success && STALE_TOKEN_ERROR.test(r.error ?? '')).map((r) => r.token);
        if (stale.length > 0) {
          await this.app.prisma.pushToken.deleteMany({ where: { token: { in: stale } } });
        }
        summary.errors.push(...results.filter((r) => !r.success).map((r) => r.error ?? 'Unknown FCM error'));
      }
      summary.errors = [...new Set(summary.errors)];

      // Surface real delivery failures - e.g. "SenderId mismatch" when the
      // active gateway key is for a different Firebase project than the app.
      if (summary.failed > 0) {
        this.app.log.warn(
          { title, sent: summary.sent, failed: summary.failed, errors: summary.errors },
          'Some push notifications were not delivered',
        );
      }
    } catch (err) {
      this.app.log.error({ err }, 'Push notification send errored');
      summary.errors.push(err instanceof Error ? err.message : 'Push send errored');
    } finally {
      await client.close();
    }
    return summary;
  }
}
