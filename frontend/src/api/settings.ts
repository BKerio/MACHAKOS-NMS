import api from '@/api/client';
import type { PushGatewaySummary, PushTestResult, SmsGatewaySummary, SmsProvider } from '@/types/api';

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

// ── Admin settings: Push (Firebase) gateway configuration ───────────────────
// SUPER_ADMIN only - see requireRole gating in backend/src/modules/settings/settings.routes.ts.

export async function getPushGateway(): Promise<PushGatewaySummary> {
  const res = await api.get('/settings/push-gateway');
  return res.data.data as PushGatewaySummary;
}

export async function updatePushGateway(serviceAccountJson: string): Promise<PushGatewaySummary> {
  const res = await api.put('/settings/push-gateway', { serviceAccountJson });
  return res.data.data as PushGatewaySummary;
}

export async function activatePushGateway(): Promise<PushGatewaySummary> {
  const res = await api.post('/settings/push-gateway/activate');
  return res.data.data as PushGatewaySummary;
}

export async function deactivatePushGateway(): Promise<PushGatewaySummary> {
  const res = await api.post('/settings/push-gateway/deactivate');
  return res.data.data as PushGatewaySummary;
}

export async function testPushGateway(): Promise<PushTestResult> {
  const res = await api.post('/settings/push-gateway/test');
  return res.data.data as PushTestResult;
}
