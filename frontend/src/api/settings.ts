import api from '@/api/client';
import type { SmsGatewaySummary, SmsProvider } from '@/types/api';

// ── Admin settings: Bulk SMS gateway configuration ──────────────────────────

export async function listSmsGateways(): Promise<SmsGatewaySummary[]> {
  const res = await api.get('/settings/sms-gateways');
  return res.data.data as SmsGatewaySummary[];
}

export async function updateSmsGateway(provider: SmsProvider, fields: Record<string, string>): Promise<SmsGatewaySummary> {
  const res = await api.put(`/settings/sms-gateways/${provider}`, fields);
  return res.data.data as SmsGatewaySummary;
}

export async function activateSmsGateway(provider: SmsProvider): Promise<SmsGatewaySummary> {
  const res = await api.post(`/settings/sms-gateways/${provider}/activate`);
  return res.data.data as SmsGatewaySummary;
}

export async function deactivateSmsGateway(provider: SmsProvider): Promise<SmsGatewaySummary> {
  const res = await api.post(`/settings/sms-gateways/${provider}/deactivate`);
  return res.data.data as SmsGatewaySummary;
}

export async function testSmsGateway(provider: SmsProvider): Promise<{ ok: boolean; message: string; credit?: number }> {
  const res = await api.post(`/settings/sms-gateways/${provider}/test`);
  return res.data.data as { ok: boolean; message: string; credit?: number };
}
