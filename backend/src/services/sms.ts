/**
 * Phone-number helpers shared by login (OTP) and SMS sending, plus the
 * ADVANTA_* environment credentials that act as the last-resort gateway
 * behind whatever Admin → SMS Gateway has configured. All sending goes
 * through SmsGatewayService (modules/settings/sms-gateway.service.ts).
 */

export function normalizeKenyanMobile(raw: string): string | null {
  const v = String(raw || '').trim().replace(/\s+/g, '').replace(/^\+/, '');
  if (!v) return null;

  if (/^254\d{9,12}$/.test(v)) return v;
  if (/^0\d{9}$/.test(v)) return `254${v.slice(1)}`;
  // Bare 9-digit subscriber number: 7xx (Safaricom/Airtel) or 1xx (newer 01x lines).
  if (/^[17]\d{8}$/.test(v)) return `254${v}`;

  const digits = v.replace(/\D/g, '');
  if (/^254\d{9,12}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return `254${digits.slice(1)}`;

  return null;
}

/** 2547XXXXXXXX -> +2547XXXXXXXX, for providers that want E.164. */
export const toE164 = (msisdn: string) => (msisdn.startsWith('+') ? msisdn : `+${msisdn}`);

/** "2547•••••678" - for logs and messages shown to admins. */
export const maskMsisdn = (msisdn: string) => msisdn.replace(/(\d{4})\d+(\d{3})/, (_m, a, b) => `${a}•••••${b}`);

/** The ADVANTA_* env account, if fully set - used after every configured gateway has failed. */
export function envAdvantaFields(): Record<string, string> | null {
  const { ADVANTA_SMS_URL, ADVANTA_API_KEY, ADVANTA_PARTNER_ID, ADVANTA_SHORTCODE } = process.env;
  if (!ADVANTA_SMS_URL || !ADVANTA_API_KEY || !ADVANTA_PARTNER_ID || !ADVANTA_SHORTCODE) return null;
  return { url: ADVANTA_SMS_URL, apiKey: ADVANTA_API_KEY, partnerId: ADVANTA_PARTNER_ID, shortcode: ADVANTA_SHORTCODE };
}
