import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlugZap, CheckCircle2, CircleSlash, FlaskConical, Save } from 'lucide-react';
import DotLoader from '@/components/shared/DotLoader';
import { useNotificationStore } from '@/stores/notificationStore';
import { activateSmsGateway, deactivateSmsGateway, listSmsGateways, testSmsGateway, updateSmsGateway } from '@/api/settings';
import type { SmsGatewaySummary } from '@/types/api';

/** Admin panel for configuring which gateway Bulk SMS actually sends through - one card per known provider. */
function SmsGatewaySettings() {
  const { data: gateways = [], isLoading } = useQuery({ queryKey: ['sms-gateways'], queryFn: listSmsGateways });

  if (isLoading) {
    return (
      <div className="col" style={{ gap: 16 }}>
        <div className="card card-pad"><div className="skel" style={{ height: 160 }} /></div>
        <div className="card card-pad"><div className="skel" style={{ height: 160 }} /></div>
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 16, maxWidth: 720 }}>
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
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['sms-gateways'] });

  const saveMutation = useMutation({
    mutationFn: () => updateSmsGateway(gateway.provider, values),
    onSuccess: () => {
      invalidate();
      setTestResult(null);
      addNotification({ type: 'success', title: 'Settings saved', message: `${gateway.label} credentials were updated.` });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Save failed', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const testMutation = useMutation({
    mutationFn: () => testSmsGateway(gateway.provider),
    onSuccess: (result) => setTestResult(result),
    onError: (err: any) => setTestResult({ ok: false, message: err?.response?.data?.message || 'Test failed. Please try again.' }),
  });

  const activateMutation = useMutation({
    mutationFn: () => activateSmsGateway(gateway.provider),
    onSuccess: () => {
      invalidate();
      addNotification({ type: 'success', title: 'Gateway activated', message: `Bulk SMS will now send through ${gateway.label}.` });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Could not activate', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateSmsGateway(gateway.provider),
    onSuccess: () => {
      invalidate();
      addNotification({ type: 'success', title: 'Gateway deactivated', message: `${gateway.label} will no longer be used for sending.` });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Could not deactivate', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const busy = saveMutation.isPending || testMutation.isPending || activateMutation.isPending || deactivateMutation.isPending;

  return (
    <div className="card">
      <div className="card-head">
        <div className="flex items-center gap-2">
          <span className="card-title">{gateway.label}</span>
          {gateway.isActive && <span className="pill pill-green"><CheckCircle2 size={12} /> Active</span>}
          {!gateway.isActive && gateway.configured && <span className="pill pill-gray">Configured</span>}
          {!gateway.implemented && <span className="pill pill-amber">Not yet supported for sending</span>}
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
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {saveMutation.isPending ? <DotLoader size={14} /> : <Save size={14} />} Save
            </button>
            <button
              type="button"
              className="btn btn-soft btn-sm"
              disabled={busy || !gateway.configured}
              onClick={() => testMutation.mutate()}
              title={!gateway.configured ? 'Save credentials first' : undefined}
            >
              {testMutation.isPending ? <DotLoader size={14} /> : <FlaskConical size={14} />} Test connection
            </button>
          </div>
          {gateway.isActive ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => deactivateMutation.mutate()}>
              <CircleSlash size={14} /> Deactivate
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-soft btn-sm"
              disabled={busy || !gateway.implemented || !gateway.configured}
              title={!gateway.implemented ? 'This provider is not yet wired up for sending' : !gateway.configured ? 'Save all required fields first' : undefined}
              onClick={() => activateMutation.mutate()}
            >
              {activateMutation.isPending ? <DotLoader size={14} /> : <PlugZap size={14} />} Set as active
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default SmsGatewaySettings;
