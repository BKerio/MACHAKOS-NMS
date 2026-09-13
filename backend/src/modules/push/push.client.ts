import { initializeApp, deleteApp, cert, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { FastifyBaseLogger } from 'fastify';

export interface PushSendResult {
  token: string;
  success: boolean;
  error?: string;
}

/**
 * Thin wrapper over the Firebase Admin SDK's messaging client, built from
 * whichever service-account credentials the admin Push Notifications
 * settings UI has saved and marked active - see
 * modules/settings/push-gateway.service.ts.
 *
 * Each instance gets its own uniquely-named firebase-admin App (rather than
 * the default app) so concurrent sends/test-connection calls never collide,
 * and it must be `close()`d when done to release that App handle.
 */
export class FcmPushClient {
  private constructor(private readonly app: App, private readonly log?: FastifyBaseLogger) {}

  static create(serviceAccountJson: string, log?: FastifyBaseLogger): FcmPushClient {
    const credentials = JSON.parse(serviceAccountJson);
    const name = `push-client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const app = initializeApp({ credential: cert(credentials) }, name);
    return new FcmPushClient(app, log);
  }

  /** Sends one (title, body) push to up to 500 tokens in a single FCM multicast call. */
  async sendMulticast(tokens: string[], title: string, body: string, data?: Record<string, string>): Promise<PushSendResult[]> {
    if (tokens.length === 0) return [];
    try {
      const response = await getMessaging(this.app).sendEachForMulticast({
        tokens,
        notification: { title, body },
        data,
      });
      return response.responses.map((r, i) => ({
        token: tokens[i],
        success: r.success,
        error: r.success ? undefined : (r.error?.message ?? 'Unknown FCM error'),
      }));
    } catch (err) {
      this.log?.error({ err }, 'FCM multicast send errored');
      return tokens.map((token) => ({
        token,
        success: false,
        error: err instanceof Error ? err.message : 'The push gateway rejected this batch',
      }));
    }
  }

  /** Verifies the service-account credentials are actually valid, without sending any notification. */
  async verifyCredentials(): Promise<{ ok: boolean; projectId?: string }> {
    try {
      const credential = this.app.options.credential;
      if (!credential) return { ok: false };
      const token = await credential.getAccessToken();
      return { ok: Boolean(token?.access_token), projectId: this.app.options.projectId };
    } catch {
      return { ok: false };
    }
  }

  /** Releases this instance's firebase-admin App handle. Always call once done with a client. */
  async close(): Promise<void> {
    await deleteApp(this.app).catch(() => {});
  }
}
