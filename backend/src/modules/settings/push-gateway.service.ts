import { FastifyInstance } from 'fastify';
import { BadRequestError } from '../../shared/errors/AppError.js';
import { encryptJson, decryptJson } from '../../shared/utils/crypto.js';
import { FcmPushClient } from '../push/push.client.js';

export interface PushGatewaySummary {
  configured: boolean;
  isActive: boolean;
  projectId: string | null;
  updatedAt: string | null;
}

interface StoredConfig {
  serviceAccountJson: string;
}

/**
 * Settings for the single Firebase Cloud Messaging gateway new-case push
 * alerts send through - only one provider exists, so at most one row ever
 * exists (mirrors SmsGatewayService's shape, minus the per-provider key).
 */
export class PushGatewayService {
  constructor(private app: FastifyInstance) {}

  private async getRow() {
    return this.app.prisma.pushGateway.findFirst();
  }

  private toSummary(row: Awaited<ReturnType<PushGatewayService['getRow']>>): PushGatewaySummary {
    if (!row) return { configured: false, isActive: false, projectId: null, updatedAt: null };

    let projectId: string | null = null;
    try {
      const { serviceAccountJson } = decryptJson<StoredConfig>(this.app.config.JWT_SECRET, row.configEnc);
      projectId = JSON.parse(serviceAccountJson).project_id ?? null;
    } catch {
      // Leave projectId null if the stored payload can't be read - `configured`
      // still reflects that a row exists.
    }

    return { configured: true, isActive: row.isActive, projectId, updatedAt: row.updatedAt.toISOString() };
  }

  /** The single gateway row's config, or the "not set up yet" summary if none exists. */
  async get(): Promise<PushGatewaySummary> {
    return this.toSummary(await this.getRow());
  }

  async upsert(serviceAccountJson: string, actorId: string): Promise<PushGatewaySummary> {
    let parsed: { project_id?: string; private_key?: string; client_email?: string };
    try {
      parsed = JSON.parse(serviceAccountJson);
    } catch {
      throw new BadRequestError('That is not valid JSON');
    }
    if (!parsed.project_id || !parsed.private_key || !parsed.client_email) {
      throw new BadRequestError(
        'That does not look like a Firebase service-account key file (missing project_id/private_key/client_email)'
      );
    }

    const configEnc = encryptJson(this.app.config.JWT_SECRET, { serviceAccountJson } satisfies StoredConfig);
    const existing = await this.getRow();
    const row = existing
      ? await this.app.prisma.pushGateway.update({ where: { id: existing.id }, data: { configEnc, updatedById: actorId } })
      : await this.app.prisma.pushGateway.create({ data: { configEnc, updatedById: actorId } });

    await this.app.prisma.auditLog.create({
      data: {
        action: 'UPDATE', subjectType: 'PUSH_GATEWAY', subjectId: row.id,
        newValues: { projectId: parsed.project_id }, userId: actorId,
      },
    });

    return this.toSummary(row);
  }

  async setActive(active: boolean, actorId: string): Promise<PushGatewaySummary> {
    const row = await this.getRow();
    if (!row) throw new BadRequestError('Save Firebase credentials before activating push notifications');

    const updated = await this.app.prisma.pushGateway.update({
      where: { id: row.id },
      data: { isActive: active, updatedById: actorId },
    });

    await this.app.prisma.auditLog.create({
      data: {
        action: 'UPDATE', subjectType: 'PUSH_GATEWAY', subjectId: row.id,
        newValues: { isActive: active }, userId: actorId,
      },
    });

    return this.toSummary(updated);
  }

  /** Builds a real client from the saved credentials and pings it - lets an admin verify before flipping the switch. */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const row = await this.getRow();
    if (!row) return { ok: false, message: 'Save Firebase credentials first.' };

    const { serviceAccountJson } = decryptJson<StoredConfig>(this.app.config.JWT_SECRET, row.configEnc);
    const client = FcmPushClient.create(serviceAccountJson, this.app.log);
    try {
      const result = await client.verifyCredentials();
      return result.ok
        ? { ok: true, message: `Connected - project "${result.projectId}".` }
        : { ok: false, message: 'Firebase rejected these credentials.' };
    } finally {
      await client.close();
    }
  }

  /** The client new-case alerts should actually send push through right now, or null if not configured/active. Caller must `close()` it. */
  async getActiveClient(): Promise<FcmPushClient | null> {
    const row = await this.getRow();
    if (!row || !row.isActive) return null;

    const { serviceAccountJson } = decryptJson<StoredConfig>(this.app.config.JWT_SECRET, row.configEnc);
    return FcmPushClient.create(serviceAccountJson, this.app.log);
  }

  async isEnabled(): Promise<boolean> {
    const row = await this.getRow();
    return Boolean(row?.isActive);
  }
}
