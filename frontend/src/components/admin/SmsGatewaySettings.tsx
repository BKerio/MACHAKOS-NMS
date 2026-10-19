import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlugZap, CheckCircle2, CircleSlash, FlaskConical, Save, Send, ShieldCheck } from 'lucide-react';
import AppLoader from '@/components/shared/AppLoader';
import { useNotificationStore } from '@/stores/notificationStore';
import {
  activateSmsGateway, deactivateSmsGateway, listSmsGateways, setSmsGatewayBackup, testSmsGateway, updateSmsGateway,
} from '@/api/settings';
import type { SmsGatewaySummary } from '@/types/api';
import LoadingState from '@/components/shared/LoadingState';

/**
 * Admin panel for the SMS gateways every text goes through - login codes,
 * Bulk SMS and alerts. One card per provider. The active gateway is tried
 * first; if it can't send (bad key, unapproved sender ID, no credit) the
 * other configured gateways marked as backup are tried, then the server's
 * own Advanta account.
 */
function SmsGatewaySettings() {
  const { data: gateways = [], isLoading } = useQuery({ queryKey: ['sms-gateways'], queryFn: listSmsGateways });

  if (isLoading) {
    return (
      <div className="col" style={{ gap: 16 }}>
        <div className="card card-pad"><LoadingState minHeight={160} /></div>
        <div className="card card-pad"><LoadingState minHeight={160} /></div>
      </div>
    );
  }

  const active = gateways.find((g) => g.isActive);
  const backups = gateways.filter((g) => !g.isActive && g.configured && g.useAsBackup);

  return (
    <div className="col" style={{ gap: 16, maxWidth: 720 }}>
      <div className="card card-pad text-sm" style={{ color: 'var(--ink-2)' }}>
        <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--ink)' }}>
          <ShieldCheck size={16} /> Send order
        </div>
        <p className="mt-1.5">
          Every SMS (crew login codes, Bulk SMS, alerts) goes through{' '}
          <b>{active?.label ?? 'no active gateway'}</b>
          {backups.length > 0 && <>, then {backups.map((b) => b.label).join(', ')} if it can't send</>}
          , then the server's own Advanta account (if one is set on the server).
        </p>
        <p className="mt-1.5" style={{ color: 'var(--muted)' }}>
          Use <b>Send test SMS</b> after changing credentials: the balance check alone can't tell whether the provider approved your sender ID.
        </p>
      </div>
      {gateways.map((g) => (
        <GatewayCard key={`${g.provider}-${g.updatedAt ?? 'new'}`} gateway={g} />
      ))}
    </div>
  );
}

function GatewayCard({ gateway }: { gateway: SmsGatewaySummary }) {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of gateway.fields) init[f.key] = f.secret ? '' : (gateway.values[f.key] ?? '');
    return init;
  });
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['sms-gateways'] });
  const failed = (title: string) => (err: any) =>
    addNotification({ type: 'error', title, message: err?.response?.data?.message || 'Please try again.' });

  const saveMutation = useMutation({
    mutationFn: () => updateSmsGateway(gateway.provider, values),
    onSuccess: () => {
      invalidate();
      setTestResult(null);
      addNotification({ type: 'success', title: 'Settings saved', message: `${gateway.label} credentials were updated. Send a test SMS to confirm they work.` });
    },
    onError: failed('Save failed'),
  });

  const testMutation = useMutation({
    mutationFn: (withSms: boolean) => testSmsGateway(gateway.provider, withSms ? testPhone : undefined),
    onSuccess: (result) => setTestResult(result),
    onError: (err: any) => setTestResult({ ok: false, message: err?.response?.data?.message || 'Test failed. Please try again.' }),
  });

  const activateMutation = useMutation({
    mutationFn: () => activateSmsGateway(gateway.provider),
    onSuccess: () => {
      invalidate();
      addNotification({ type: 'success', title: 'Gateway activated', message: `SMS will now go through ${gateway.label} first.` });
    },
    onError: failed('Could not activate'),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateSmsGateway(gateway.provider),
    onSuccess: () => {
      invalidate();
      addNotification({ type: 'success', title: 'Gateway deactivated', message: `${gateway.label} is no longer the main gateway.` });
    },
    onError: failed('Could not deactivate'),
  });

  const backupMutation = useMutation({
    mutationFn: (on: boolean) => setSmsGatewayBackup(gateway.provider, on),
    onSuccess: invalidate,
    onError: failed('Could not change backup'),
  });

  const busy = saveMutation.isPending || testMutation.isPending || activateMutation.isPending || deactivateMutation.isPending || backupMutation.isPending;

  return (
    <div className="card">
      <div className="card-head">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="card-title">{gateway.label}</span>
          {gateway.isActive && <span className="pill pill-green"><CheckCircle2 size={12} /> Active · sends first</span>}
          {!gateway.isActive && gateway.configured && gateway.useAsBackup && <span className="pill pill-blue">Backup</span>}
          {!gateway.isActive && gateway.configured && !gateway.useAsBackup && <span className="pill pill-gray">Configured · not used</span>}
        </div>
        {gateway.updatedAt && (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Updated {new Date(gateway.updatedAt).toLocaleString()}</span>
        )}
      </div>

      <form
        className="card-pad col"
        style={{ gap: 14 }}
        onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
      >
        {gateway.fields.map((f) => (
          <div className="field" key={f.key}>
            <label className="label" htmlFor={`${gateway.provider}-${f.key}`}>{f.label}</label>
            <input
              id={`${gateway.provider}-${f.key}`}
              className="input"
              type={f.secret ? 'password' : 'text'}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={f.secret ? (gateway.values[f.key] || f.placeholder || 'Not set') : f.placeholder}
              autoComplete="off"
            />
            {f.secret && gateway.values[f.key] && (
              <span className="text-xs" style={{ color: 'var(--muted)' }}>Current: {gateway.values[f.key]} - leave blank to keep it.</span>
            )}
          </div>
        ))}

        {gateway.configured && (
          <div className="field">
            <label className="label" htmlFor={`${gateway.provider}-test-phone`}>Test it</label>
            <div className="flex gap-2 flex-wrap">
              <input
                id={`${gateway.provider}-test-phone`}
                className="input"
                style={{ flex: '1 1 180px' }}
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="Your phone, e.g. 0712345678"
                inputMode="tel"
              />
              <button
                type="button"
                className="btn btn-soft btn-sm"
                disabled={busy || !testPhone.trim()}
                onClick={() => testMutation.mutate(true)}
                title="Sends a real SMS through this gateway only"
              >
                {testMutation.isPending && testMutation.variables ? <AppLoader size={18} /> : <Send size={14} />} Send test SMS
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => testMutation.mutate(false)}>
                {testMutation.isPending && !testMutation.variables ? <AppLoader size={18} /> : <FlaskConical size={14} />} Check balance only
              </button>
            </div>
          </div>
        )}

        {testResult && (
          <div
            className="text-sm"
            style={{
              padding: '10px 12px', borderRadius: 'var(--radius-sm)',
              background: testResult.ok ? 'var(--green-light)' : 'var(--red-soft)',
              color: testResult.ok ? 'var(--green)' : 'var(--red)',
              fontWeight: 600,
            }}
          >
            {testResult.message}
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginTop: 4 }}>
          <div className="flex gap-2 items-center flex-wrap">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {saveMutation.isPending ? <AppLoader size={18} /> : <Save size={14} />} Save
            </button>
            {gateway.configured && !gateway.isActive && (
              <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--ink-2)' }}>
                <input
                  type="checkbox"
                  checked={gateway.useAsBackup}
                  disabled={busy}
                  onChange={(e) => backupMutation.mutate(e.target.checked)}
                />
                Use as backup
              </label>
            )}
          </div>
          {gateway.isActive ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => deactivateMutation.mutate()}>
              {deactivateMutation.isPending ? <AppLoader size={18} /> : <CircleSlash size={14} />} Deactivate
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-soft btn-sm"
              disabled={busy || !gateway.configured}
              title={!gateway.configured ? 'Save all required fields first' : undefined}
              onClick={() => activateMutation.mutate()}
            >
              {activateMutation.isPending ? <AppLoader size={18} /> : <PlugZap size={14} />} Set as active
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default SmsGatewaySettings;
