import { SmsProvider } from '../../shared/types/index.js';

export interface ProviderField {
  key: string;
  label: string;
  secret: boolean;
  placeholder?: string;
}

/**
 * Credential field schema per SMS provider, driving both the Settings API's
 * validation/masking and the frontend's form rendering (kept in sync by hand
 * with frontend/src/lib/smsProviders.ts - small and stable enough that a
 * shared package would be overkill for a single-app repo).
 */
export const PROVIDER_FIELDS: Record<SmsProvider, ProviderField[]> = {
  ADVANTA: [
    { key: 'url', label: 'API URL', secret: false, placeholder: 'https://quicksms.advantasms.com/api/services/sendsms/' },
    { key: 'apiKey', label: 'API Key', secret: true },
    { key: 'partnerId', label: 'Partner ID', secret: false },
    { key: 'shortcode', label: 'Shortcode / Sender ID', secret: false },
  ],
  AFRICAS_TALKING: [
    { key: 'username', label: 'Username', secret: false },
    { key: 'apiKey', label: 'API Key', secret: true },
    { key: 'senderId', label: 'Sender ID (optional)', secret: false },
  ],
  TWILIO: [
    { key: 'accountSid', label: 'Account SID', secret: false },
    { key: 'authToken', label: 'Auth Token', secret: true },
    { key: 'fromNumber', label: 'From Number', secret: false, placeholder: '+15551234567' },
  ],
};

export const PROVIDER_LABELS: Record<SmsProvider, string> = {
  ADVANTA: 'Advanta (QuickSMS)',
  AFRICAS_TALKING: "Africa's Talking",
  TWILIO: 'Twilio',
};

/** Providers with an actual send client wired up (see modules/sms/). Others can be configured/tested but not activated yet. */
export const IMPLEMENTED_PROVIDERS: SmsProvider[] = ['ADVANTA'];

export function isProviderImplemented(provider: SmsProvider): boolean {
  return IMPLEMENTED_PROVIDERS.includes(provider);
}

export function requiredFieldsPresent(provider: SmsProvider, fields: Record<string, string>): boolean {
  return PROVIDER_FIELDS[provider].every((f) => Boolean(fields[f.key]?.trim()));
}

/** Masks secret fields for API responses - e.g. "a03277821205" -> "••••••••1205". Non-secret fields pass through untouched. */
export function maskFields(provider: SmsProvider, fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of PROVIDER_FIELDS[provider]) {
    const value = fields[f.key] ?? '';
    if (!f.secret || !value) {
      out[f.key] = value;
      continue;
    }
    out[f.key] = value.length <= 4 ? '••••' : `${'•'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
  }
  return out;
}
