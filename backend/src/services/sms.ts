import axios from 'axios';

const {
  ADVANTA_SMS_URL,
  ADVANTA_API_KEY,
  ADVANTA_PARTNER_ID,
  ADVANTA_SHORTCODE,
} = process.env;

export function isAdvantaSmsConfigured(): boolean {
  return Boolean(ADVANTA_SMS_URL && ADVANTA_API_KEY && ADVANTA_PARTNER_ID && ADVANTA_SHORTCODE);
}

export function normalizeKenyanMobile(raw: string): string | null {
  const v = String(raw || '').trim().replace(/\s+/g, '').replace(/^\+/, '');
  if (!v) return null;

  if (/^254\d{9,12}$/.test(v)) return v;
  if (/^0\d{9}$/.test(v)) return `254${v.slice(1)}`;
  if (/^7\d{8}$/.test(v)) return `254${v}`;

  const digits = v.replace(/\D/g, '');
  if (/^254\d{9,12}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return `254${digits.slice(1)}`;

  return null;
}

const ADVANTA_CODE_MESSAGES: Record<string, string> = {
  '1001': 'invalid sender id / shortcode',
  '1002': 'network not allowed',
  '1003': 'invalid mobile number',
  '1004': 'low bulk SMS credits',
  '1005': 'gateway system error',
  '1006': 'invalid credentials (check ADVANTA_API_KEY / ADVANTA_PARTNER_ID)',
  '1007': 'gateway system error',
  '1009': 'unsupported data type',
  '1010': 'unsupported request type',
  '4090': 'gateway internal error, retry in a few minutes',
  '4091': 'no partner ID set',
  '4092': 'no API key provided',
  '4093': 'account details not found',
};

/**
 * Advanta answers HTTP 200 even when it refuses to send (bad credentials, no
 * credit, unroutable number), reporting the real outcome as a per-recipient
 * code in the body. Without this check a rejected message looks like a success
 * and the caller tells the user a code is on its way that never arrives.
 */
function assertAdvantaAccepted(data: unknown): void {
  let payload: any = data;

  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return; // Non-JSON reply - nothing reliable to assert on.
    }
  }

  const entries = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.responses)
      ? payload.responses
      : Array.isArray(payload?.payload)
        ? payload.payload
        : null;

  if (!entries?.length) return;

  for (const entry of entries) {
    // Advanta ships the misspelled "respose-code" key alongside the correct one.
    const raw = entry?.['respose-code'] ?? entry?.['response-code'] ?? entry?.code;
    if (raw === undefined || raw === null) continue;

    const code = String(raw);
    // 1008 is "no delivery report" - the send itself was accepted.
    if (code === '200' || code === '1008') continue;

    const detail = entry?.['response-description'] || ADVANTA_CODE_MESSAGES[code] || 'unknown gateway error';
    throw new Error(`Advanta SMS rejected the message (code ${code}): ${detail}`);
  }
}

export interface AdvantaCreds {
  url: string;
  apiKey: string;
  partnerId: string;
  shortcode: string;
}

/**
 * The actual Advanta send, parameterized on credentials rather than reading
 * process.env directly - lets a caller send through whichever credentials
 * apply (env vars for system notifications, or the DB-backed gateway an
 * admin configured in Settings for Bulk SMS - see sendAdvantaSms below and
 * modules/settings/sms-gateway.service.ts).
 */
export async function sendAdvantaSmsWithCreds(creds: AdvantaCreds, toPhone: string, message: string): Promise<void> {
  const mobile = normalizeKenyanMobile(toPhone);
  if (!mobile) {
    throw new Error('Invalid mobile number');
  }

  // Advanta docs show JSON, but many gateways accept/expect form encoding.
  // Form encoding is generally the most compatible across deployments.
  const body = new URLSearchParams({
    apikey: creds.apiKey,
    partnerID: creds.partnerId,
    message: String(message),
    shortcode: creds.shortcode,
    mobile,
  });

  const resp = await axios.post(creds.url, body.toString(), {
    timeout: 15000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    validateStatus: () => true,
  });

  if (resp.status < 200 || resp.status >= 300) {
    const respBody = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    throw new Error(`Advanta SMS failed (${resp.status}): ${respBody}`);
  }

  assertAdvantaAccepted(resp.data);
}

/**
 * Sends via the ADVANTA_* env vars - unchanged entry point for system
 * notifications (OTP, driver assignment) that aren't part of the
 * admin-configurable Bulk SMS gateway. Bulk SMS itself (services/sms.routes.ts)
 * sends through sendAdvantaSmsWithCreds using whichever gateway Settings has
 * marked active instead.
 */
export async function sendAdvantaSms(toPhone: string, message: string): Promise<void> {
  if (!isAdvantaSmsConfigured()) {
    throw new Error('SMS is not configured. Set ADVANTA_SMS_URL, ADVANTA_API_KEY, ADVANTA_PARTNER_ID, ADVANTA_SHORTCODE');
  }

  return sendAdvantaSmsWithCreds(
    { url: String(ADVANTA_SMS_URL), apiKey: String(ADVANTA_API_KEY), partnerId: String(ADVANTA_PARTNER_ID), shortcode: String(ADVANTA_SHORTCODE) },
    toPhone,
    message,
  );
}
