import { FastifyInstance } from 'fastify';
import { SmsProvider } from '../../shared/types/index.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/AppError.js';
import { encryptJson, decryptJson } from '../../shared/utils/crypto.js';
import { createDriver, type SmsDriver } from '../sms/drivers.js';
import { envAdvantaFields, maskMsisdn, normalizeKenyanMobile } from '../../services/sms.js';
import { PROVIDER_FIELDS, PROVIDER_LABELS, requiredFieldsPresent, maskFields } from './sms-provider-registry.js';

export interface GatewaySummary {
  provider: SmsProvider;
  label: string;
  implemented: boolean;
  configured: boolean;
  isActive: boolean;
  useAsBackup: boolean;
  fields: { key: string; label: string; secret: boolean; placeholder?: string; optional?: boolean }[];
  values: Record<string, string>;
  updatedAt: string | null;
}

type Fields = Record<string, string>;

/** A gateway that can be sent through, in failover order. */
interface Gateway {
  /** SmsProvider, or ADVANTA_ENV for the env-var account. */
  key: string;
  label: string;
  driver: SmsDriver;
}

export interface SendOptions {
  /** OTP | MANUAL | SYSTEM | TEST - stored on the sms_messages row. */
  category: string;
  /** What to store instead of the message, e.g. so login codes never hit the DB. */
  logText?: string;
  sentById?: string;
  incidentId?: string;
  groupLabel?: string;
}

export interface SendOutcome {
  ok: boolean;
  to: string;
  provider?: string;
  error?: string;
}

/** Every gateway refused, or the number is unusable. `message` is safe to log, not to show crews. */
export class SmsSendError extends Error {
  constructor(message: string, readonly scope: 'recipient' | 'gateway' | 'none') {
    super(message);
  }
}

const BULK_CONCURRENCY = 5;
const ENV_KEY = 'ADVANTA_ENV';

/**
 * All SMS - login codes, bulk sends, alerts - goes through here. Sending
 * tries the active gateway first; if the provider refuses for an
 * account-level reason (bad key, unapproved sender ID, no credit, outage) it
 * moves on to the other configured gateways marked "use as backup", then the
 * ADVANTA_* env account. A refusal about the number itself stops there,
 * since no other gateway would reach it either. Every attempt is logged in
 * sms_messages so admins can see what was sent, through what, and why
 * anything failed.
 */
export class SmsGatewayService {
  constructor(private app: FastifyInstance) {}

  /**
   * One-time migration hook, called at server startup: if Settings has never
   * been touched (no rows yet) and the ADVANTA_* env vars are fully set, seed
   * + activate a row from them so an existing deployment keeps sending without
   * anyone having to retype credentials into the UI.
   */
  async ensureSeedFromEnv(): Promise<void> {
    const existing = await this.app.prisma.smsGateway.count();
    if (existing > 0) return;

    const fields = envAdvantaFields();
    if (!fields) return;

    await this.app.prisma.smsGateway.create({
      data: { provider: 'ADVANTA', isActive: true, configEnc: encryptJson(this.app.config.JWT_SECRET, fields) },
    });
    this.app.log.info('Seeded SMS gateway settings from ADVANTA_* environment variables');
  }

  /** Decrypts a row's credentials; null (and a log line) if they can't be read. */
  private decrypt(provider: SmsProvider, configEnc: string): Fields | null {
    try {
      return decryptJson<Fields>(this.app.config.JWT_SECRET, configEnc);
    } catch (err) {
      this.app.log.error({ err, provider }, 'SMS gateway credentials could not be decrypted (JWT_SECRET changed?) - re-save them in Settings');
      return null;
    }
  }

  private async getRawFields(provider: SmsProvider): Promise<Fields | null> {
    const row = await this.app.prisma.smsGateway.findUnique({ where: { provider } });
    return row ? this.decrypt(provider, row.configEnc) : null;
  }

  private toSummary(
    provider: SmsProvider,
    fields: Fields | null,
    row: { isActive: boolean; useAsBackup: boolean; updatedAt: Date } | null,
  ): GatewaySummary {
    return {
      provider,
      label: PROVIDER_LABELS[provider],
      implemented: true,
      configured: fields !== null && requiredFieldsPresent(provider, fields),
      isActive: row?.isActive ?? false,
      useAsBackup: row?.useAsBackup ?? true,
      fields: PROVIDER_FIELDS[provider],
      values: maskFields(provider, fields ?? {}),
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  /** Every known provider, configured or not - so the Settings page can render a card per provider. */
  async list(): Promise<GatewaySummary[]> {
    const rows = await this.app.prisma.smsGateway.findMany();
    const byProvider = new Map(rows.map((r) => [r.provider, r]));

    return (Object.keys(PROVIDER_FIELDS) as SmsProvider[]).map((provider) => {
      const row = byProvider.get(provider) ?? null;
      return this.toSummary(provider, row ? this.decrypt(provider, row.configEnc) : null, row);
    });
  }

  async upsert(provider: SmsProvider, incoming: Fields, actorId: string): Promise<GatewaySummary> {
    const existing = (await this.getRawFields(provider)) ?? {};
    const merged: Fields = {};
    for (const f of PROVIDER_FIELDS[provider]) {
      const incomingVal = incoming[f.key]?.trim();
      if (incomingVal) {
        merged[f.key] = incomingVal;
      } else if (f.secret) {
        // Blank means "leave the saved secret alone" - the UI only ever shows a masked value back.
        merged[f.key] = existing[f.key] ?? '';
      } else {
        merged[f.key] = incoming[f.key] !== undefined ? '' : (existing[f.key] ?? '');
      }
    }

    const configEnc = encryptJson(this.app.config.JWT_SECRET, merged);
    const row = await this.app.prisma.smsGateway.upsert({
      where: { provider },
      create: { provider, configEnc, updatedById: actorId },
      update: { configEnc, updatedById: actorId },
    });

    await this.audit(provider, { fields: Object.keys(merged) }, actorId);
    return this.toSummary(provider, merged, row);
  }

  async setActive(provider: SmsProvider, actorId: string): Promise<GatewaySummary> {
    const row = await this.app.prisma.smsGateway.findUnique({ where: { provider } });
    if (!row) throw new BadRequestError("Save this gateway's credentials before activating it");

    const fields = this.decrypt(provider, row.configEnc);
    if (!fields || !requiredFieldsPresent(provider, fields)) {
      throw new BadRequestError('Fill in all required fields before activating this gateway');
    }

    const updated = await this.app.prisma.$transaction(async (tx) => {
      await tx.smsGateway.updateMany({ where: { isActive: true }, data: { isActive: false } });
      return tx.smsGateway.update({ where: { provider }, data: { isActive: true, updatedById: actorId } });
    });

    await this.audit(provider, { isActive: true }, actorId);
    return this.toSummary(provider, fields, updated);
  }

  async deactivate(provider: SmsProvider, actorId: string): Promise<GatewaySummary> {
    const row = await this.app.prisma.smsGateway.findUnique({ where: { provider } });
    if (!row) throw new NotFoundError('SMS gateway');

    const updated = await this.app.prisma.smsGateway.update({ where: { provider }, data: { isActive: false, updatedById: actorId } });
    await this.audit(provider, { isActive: false }, actorId);
    return this.toSummary(provider, this.decrypt(provider, row.configEnc), updated);
  }

  /** Whether this gateway is tried when the active one can't send. */
  async setBackup(provider: SmsProvider, useAsBackup: boolean, actorId: string): Promise<GatewaySummary> {
    const row = await this.app.prisma.smsGateway.findUnique({ where: { provider } });
    if (!row) throw new BadRequestError("Save this gateway's credentials first");

    const updated = await this.app.prisma.smsGateway.update({ where: { provider }, data: { useAsBackup, updatedById: actorId } });
    await this.audit(provider, { useAsBackup }, actorId);
    return this.toSummary(provider, this.decrypt(provider, row.configEnc), updated);
  }

  /**
   * Checks a provider's saved credentials (balance / account lookup) and,
   * given a phone number, sends a real test SMS through that provider alone -
   * the only way to catch a sender ID the provider won't accept.
   */
  async testConnection(provider: SmsProvider, testPhone?: string, actorId?: string): Promise<{ ok: boolean; message: string; credit?: number }> {
    const fields = await this.getRawFields(provider);
    if (!fields) return { ok: false, message: 'Save credentials for this provider first.' };
    if (!requiredFieldsPresent(provider, fields)) return { ok: false, message: 'Fill in all required fields first.' };

    const driver = createDriver(provider, fields);
    const balance = await driver.balance();
    if (!balance.ok || !testPhone?.trim()) {
      return testPhone?.trim() || !balance.ok
        ? balance
        : { ...balance, message: `${balance.message} Send a test SMS to confirm the sender ID is approved.` };
    }

    const to = normalizeKenyanMobile(testPhone);
    if (!to) return { ok: false, message: `${balance.message} But "${testPhone}" isn't a valid phone number for the test SMS.` };

    const message = `EOC SMS gateway test via ${PROVIDER_LABELS[provider]}. If you got this, the gateway can send.`;
    const result = await driver.send(to, message);
    await this.log(to, { category: 'TEST', sentById: actorId }, message, provider, result.ok ? { messageId: result.messageId } : { error: result.error });
    return result.ok
      ? { ok: true, message: `${balance.message} Test SMS accepted for ${maskMsisdn(to)} - check the phone.`, credit: balance.credit }
      : { ok: false, message: `${balance.message} But the test SMS was refused: ${result.error}`, credit: balance.credit };
  }

  /** Gateways in the order a message tries them: active, backups (latest saved first), then the env account. */
  private async gateways(): Promise<Gateway[]> {
    const rows = await this.app.prisma.smsGateway.findMany({ orderBy: { updatedAt: 'desc' } });
    const ordered = [...rows.filter((r) => r.isActive), ...rows.filter((r) => !r.isActive && r.useAsBackup)];

    const out: Gateway[] = [];
    const seenAdvanta: Fields[] = [];
    for (const row of ordered) {
      const fields = this.decrypt(row.provider, row.configEnc);
      if (!fields || !requiredFieldsPresent(row.provider, fields)) continue;
      if (row.provider === 'ADVANTA') seenAdvanta.push(fields);
      out.push({ key: row.provider, label: PROVIDER_LABELS[row.provider], driver: createDriver(row.provider, fields) });
    }

    const env = envAdvantaFields();
    const sameAccount = (f: Fields) => f.apiKey === env?.apiKey && f.partnerId === env?.partnerId && f.shortcode === env?.shortcode;
    if (env && !seenAdvanta.some(sameAccount)) {
      out.push({ key: ENV_KEY, label: 'Advanta (server settings)', driver: createDriver('ADVANTA', env) });
    }
    return out;
  }

  /**
   * Sends one SMS, failing over between gateways. `broken` (shared across a
   * bulk send) holds gateways that already refused for an account-level
   * reason, so later numbers skip them.
   */
  private async sendVia(
    gateways: Gateway[],
    to: string,
    message: string,
    opts: SendOptions,
    broken: Set<string> = new Set(),
  ): Promise<SendOutcome> {
    const usable = gateways.filter((g) => !broken.has(g.key));
    if (!usable.length) {
      const error = gateways.length
        ? 'Every SMS gateway refused to send. Check Admin → SMS Gateway.'
        : 'No SMS gateway is set up. Add one under Admin → SMS Gateway.';
      await this.log(to, opts, message, undefined, { error });
      return { ok: false, to, error };
    }

    const refusals: string[] = [];
    for (const g of usable) {
      const result = await g.driver.send(to, message);
      if (result.ok) {
        if (refusals.length) this.app.log.warn({ to: maskMsisdn(to), via: g.key, refusals }, 'SMS sent after failover');
        await this.log(to, opts, message, g.key, { messageId: result.messageId, note: refusals.join(' | ') || undefined });
        return { ok: true, to, provider: g.key };
      }

      refusals.push(`${g.label}: ${result.error}`);
      if (result.scope === 'recipient') break;
      broken.add(g.key);
      this.app.log.error({ to: maskMsisdn(to), gateway: g.key, error: result.error }, 'SMS gateway refused - trying the next one');
    }

    const error = refusals.join(' | ');
    await this.log(to, opts, message, undefined, { error });
    return { ok: false, to, error };
  }

  /** Sends one SMS (login code, alert). Throws SmsSendError when nothing could send it. */
  async send(toRaw: string, message: string, opts: SendOptions): Promise<SendOutcome> {
    const to = normalizeKenyanMobile(toRaw);
    if (!to) throw new SmsSendError(`"${toRaw}" is not a valid phone number`, 'recipient');

    const outcome = await this.sendVia(await this.gateways(), to, message, opts);
    if (!outcome.ok) throw new SmsSendError(outcome.error ?? 'SMS not sent', 'gateway');
    return outcome;
  }

  /** Bulk send: checks and de-duplicates numbers, then sends a few at a time. */
  async sendMany(numbers: string[], message: string, opts: SendOptions) {
    const results: SendOutcome[] = [];
    const targets: string[] = [];
    const seen = new Set<string>();
    for (const raw of numbers) {
      const to = normalizeKenyanMobile(raw);
      if (!to) results.push({ ok: false, to: raw, error: 'Not a valid phone number' });
      else if (!seen.has(to)) {
        seen.add(to);
        targets.push(to);
      }
    }

    const gateways = await this.gateways();
    const broken = new Set<string>();
    let next = 0;
    const worker = async () => {
      while (next < targets.length) {
        const to = targets[next++];
        results.push(await this.sendVia(gateways, to, message, opts, broken));
      }
    };
    await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, targets.length) }, worker));

    const failedResults = results.filter((r) => !r.ok);
    const byProvider: Record<string, number> = {};
    for (const r of results) if (r.ok && r.provider) byProvider[r.provider] = (byProvider[r.provider] ?? 0) + 1;

    return {
      total: results.length,
      duplicatesRemoved: numbers.length - results.length,
      sent: results.length - failedResults.length,
      failed: failedResults.length,
      byProvider,
      errors: failedResults.map((r) => ({ number: r.to, error: r.error ?? 'Not sent' })),
    };
  }

  /** The latest logged SMS, newest first, for the Bulk SMS page. */
  async recent(limit = 50) {
    return this.app.prisma.smsMessage.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(limit, 200) });
  }

  async isEnabled(): Promise<boolean> {
    return (await this.gateways()).length > 0;
  }

  private async log(
    to: string,
    opts: SendOptions,
    message: string,
    provider: string | undefined,
    result: { messageId?: string; error?: string; note?: string },
  ) {
    try {
      await this.app.prisma.smsMessage.create({
        data: {
          recipient: to,
          message: opts.logText ?? message,
          category: opts.category,
          status: result.error ? 'FAILED' : 'SENT',
          provider,
          providerMessageId: result.messageId,
          // On a successful send after failover, note why earlier gateways refused.
          error: result.error ?? (result.note ? `Sent after failover. Refused by: ${result.note}` : undefined),
          sentById: opts.sentById,
          incidentId: opts.incidentId,
          groupLabel: opts.groupLabel,
        },
      });
    } catch (err) {
      this.app.log.warn({ err }, 'Could not log SMS');
    }
  }

  private async audit(provider: SmsProvider, newValues: Record<string, unknown>, userId: string) {
    await this.app.prisma.auditLog.create({
      data: { action: 'UPDATE', subjectType: 'SMS_GATEWAY', subjectId: provider, newValues: newValues as any, userId },
    });
  }
}
