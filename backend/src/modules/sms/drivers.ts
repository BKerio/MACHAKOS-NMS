import { SmsProvider } from '../../shared/types/index.js';
import { toE164 } from '../../services/sms.js';

/**
 * One driver per SMS provider API. Every driver answers the same way so the
 * sender (modules/settings/sms-gateway.service.ts) can fail over between them:
 *
 *  - `ok: true`                        - the provider accepted the message.
 *  - `ok: false, scope: 'recipient'`   - this number can't be reached (invalid,
 *                                         blocked network). Another gateway
 *                                         won't do better, so don't fail over.
 *  - `ok: false, scope: 'gateway'`     - the account can't send right now (bad
 *                                         key, unapproved sender ID, no credit,
 *                                         provider down). Try the next gateway.
 *
 * Drivers never throw; network errors come back as gateway-scope failures.
 */
export type SendResult =
  | { ok: true; messageId?: string }
  | { ok: false; scope: 'recipient' | 'gateway'; error: string };

export interface BalanceResult {
  ok: boolean;
  message: string;
  credit?: number;
}

export interface SmsDriver {
  /** `msisdn` is normalized: 2547XXXXXXXX. */
  send(msisdn: string, message: string): Promise<SendResult>;
  balance(): Promise<BalanceResult>;
}

type Fields = Record<string, string>;

const TIMEOUT_MS = 15_000;

async function request(url: string, init: RequestInit): Promise<{ status: number; text: string }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: res.status, text: await res.text() };
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const networkFailure = (provider: string, err: unknown): SendResult => ({
  ok: false,
  scope: 'gateway',
  error: `${provider} unreachable: ${err instanceof Error ? err.message : String(err)}`,
});

// ── Advanta (QuickSMS) ───────────────────────────────────────────────────────

const ADVANTA_CODES: Record<string, string> = {
  '1001': 'invalid sender ID / shortcode',
  '1002': 'network not allowed',
  '1003': 'invalid mobile number',
  '1004': 'low bulk SMS credits',
  '1005': 'gateway system error',
  '1006': 'invalid credentials (API key / partner ID)',
  '1007': 'unauthorized or inactive sender ID for this account',
  '1009': 'unsupported data type',
  '1010': 'unsupported request type',
  '4090': 'gateway internal error, retry in a few minutes',
  '4091': 'no partner ID set',
  '4092': 'no API key provided',
  '4093': 'account details not found',
};
// Codes about the number itself; every other code is about the account.
const ADVANTA_RECIPIENT_CODES = new Set(['1002', '1003']);

class AdvantaDriver implements SmsDriver {
  constructor(private f: Fields) {}

  async send(msisdn: string, message: string): Promise<SendResult> {
    // Form encoding is what the sendsms endpoint reliably accepts.
    const body = new URLSearchParams({
      apikey: this.f.apiKey,
      partnerID: this.f.partnerId,
      shortcode: this.f.shortcode,
      mobile: msisdn,
      message,
    });
    try {
      const res = await request(this.f.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const data = parseJson(res.text);
      // Advanta reports per recipient, sometimes with HTTP 200 for a refusal.
      const entry = (Array.isArray(data?.responses) ? data.responses : Array.isArray(data) ? data : [])[0];
      const code = String(entry?.['response-code'] ?? entry?.['respose-code'] ?? (res.status < 300 ? '200' : res.status));
      if (code === '200' || code === '1008') {
        return { ok: true, messageId: entry?.messageid != null ? String(entry.messageid) : undefined };
      }
      const detail = entry?.['response-description'] || ADVANTA_CODES[code] || res.text.slice(0, 200) || `HTTP ${res.status}`;
      return {
        ok: false,
        scope: ADVANTA_RECIPIENT_CODES.has(code) ? 'recipient' : 'gateway',
        error: `Advanta refused (code ${code}): ${detail}`,
      };
    } catch (err) {
      return networkFailure('Advanta', err);
    }
  }

  async balance(): Promise<BalanceResult> {
    // The balance endpoint sits next to sendsms on the same host.
    const url = this.f.url.replace(/sendsms\/?$/i, 'getbalance/');
    try {
      const res = await request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apikey: this.f.apiKey, partnerID: this.f.partnerId, shortcode: this.f.shortcode }),
      });
      const data = parseJson(res.text);
      const credit = Number(data?.credit);
      if (String(data?.['response-code']) === '200' && Number.isFinite(credit)) {
        return { ok: true, message: `Credentials accepted - ${credit.toLocaleString()} credit(s) remaining.`, credit };
      }
      const code = String(data?.['response-code'] ?? res.status);
      return { ok: false, message: `Advanta refused the credentials (code ${code}): ${data?.['response-description'] || ADVANTA_CODES[code] || res.text.slice(0, 200)}` };
    } catch (err) {
      return { ok: false, message: `Advanta unreachable: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ── Africa's Talking ─────────────────────────────────────────────────────────

// Per-recipient status codes: 100 processed, 101 sent, 102 queued.
const AT_SENT = new Set([100, 101, 102]);
// 403 invalid phone, 404 unsupported number type, 406 user in blacklist.
const AT_RECIPIENT = new Set([403, 404, 406]);

class AfricasTalkingDriver implements SmsDriver {
  constructor(private f: Fields) {}

  private get host() {
    return this.f.username.trim().toLowerCase() === 'sandbox' ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
  }

  async send(msisdn: string, message: string): Promise<SendResult> {
    const body = new URLSearchParams({ username: this.f.username, to: toE164(msisdn), message });
    if (this.f.senderId?.trim()) body.set('from', this.f.senderId.trim());
    try {
      const res = await request(`${this.host}/version1/messaging`, {
        method: 'POST',
        headers: { apiKey: this.f.apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const data = parseJson(res.text);
      const recipient = data?.SMSMessageData?.Recipients?.[0];
      if (recipient && AT_SENT.has(Number(recipient.statusCode))) {
        return { ok: true, messageId: recipient.messageId };
      }
      if (recipient) {
        return {
          ok: false,
          scope: AT_RECIPIENT.has(Number(recipient.statusCode)) ? 'recipient' : 'gateway',
          error: `Africa's Talking refused (${recipient.statusCode}): ${recipient.status}`,
        };
      }
      // No recipient entry: the whole request was refused (auth, sender ID...).
      return { ok: false, scope: 'gateway', error: `Africa's Talking refused (HTTP ${res.status}): ${data?.SMSMessageData?.Message || res.text.slice(0, 200)}` };
    } catch (err) {
      return networkFailure("Africa's Talking", err);
    }
  }

  async balance(): Promise<BalanceResult> {
    try {
      const res = await request(`${this.host}/version1/user?username=${encodeURIComponent(this.f.username)}`, {
        headers: { apiKey: this.f.apiKey, Accept: 'application/json' },
      });
      const balance = parseJson(res.text)?.UserData?.balance as string | undefined;
      if (res.status === 200 && balance) {
        const credit = Number(balance.replace(/[^\d.]/g, ''));
        return { ok: true, message: `Credentials accepted - balance ${balance}.`, credit: Number.isFinite(credit) ? credit : undefined };
      }
      return { ok: false, message: `Africa's Talking refused the credentials (HTTP ${res.status}): ${res.text.slice(0, 200)}` };
    } catch (err) {
      return { ok: false, message: `Africa's Talking unreachable: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ── Twilio ───────────────────────────────────────────────────────────────────

// 21211 invalid To, 21614 not a mobile number, 21610 recipient unsubscribed,
// 21408 region not enabled for the account is account-side (gateway).
const TWILIO_RECIPIENT = new Set([21211, 21614, 21610, 21612]);

class TwilioDriver implements SmsDriver {
  constructor(private f: Fields) {}

  private get auth() {
    return `Basic ${Buffer.from(`${this.f.accountSid}:${this.f.authToken}`).toString('base64')}`;
  }

  async send(msisdn: string, message: string): Promise<SendResult> {
    const body = new URLSearchParams({ To: toE164(msisdn), From: this.f.fromNumber, Body: message });
    try {
      const res = await request(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.f.accountSid)}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: this.auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const data = parseJson(res.text);
      if (res.status >= 200 && res.status < 300 && data?.sid) return { ok: true, messageId: data.sid };
      const code = Number(data?.code);
      return {
        ok: false,
        scope: TWILIO_RECIPIENT.has(code) ? 'recipient' : 'gateway',
        error: `Twilio refused (${data?.code ?? res.status}): ${data?.message || res.text.slice(0, 200)}`,
      };
    } catch (err) {
      return networkFailure('Twilio', err);
    }
  }

  async balance(): Promise<BalanceResult> {
    try {
      const res = await request(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.f.accountSid)}/Balance.json`, {
        headers: { Authorization: this.auth },
      });
      const data = parseJson(res.text);
      if (res.status === 200 && data?.balance != null) {
        const credit = Number(data.balance);
        return { ok: true, message: `Credentials accepted - balance ${data.balance} ${data.currency ?? ''}.`.trim(), credit };
      }
      return { ok: false, message: `Twilio refused the credentials (HTTP ${res.status}): ${data?.message || res.text.slice(0, 200)}` };
    } catch (err) {
      return { ok: false, message: `Twilio unreachable: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

export function createDriver(provider: SmsProvider, fields: Fields): SmsDriver {
  switch (provider) {
    case 'ADVANTA':
      return new AdvantaDriver(fields);
    case 'AFRICAS_TALKING':
      return new AfricasTalkingDriver(fields);
    case 'TWILIO':
      return new TwilioDriver(fields);
  }
}
