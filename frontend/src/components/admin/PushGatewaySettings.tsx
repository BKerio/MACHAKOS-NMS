import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CircleCheck as CheckCircle, CircleX as XCircle, PlugZap, CircleSlash, FlaskConical, Save } from 'lucide-react';
import { activatePushGateway, deactivatePushGateway, getPushGateway, testPushGateway, updatePushGateway } from '@/api/settings';
import { useNotificationStore } from '@/stores/notificationStore';

/**
 * Admin/Super Admin card: paste a Firebase service-account JSON to enable
 * mobile push (new-case alerts to a crew's phone), test the credentials,
 * then activate. Mirrors SmsGatewaySettings.tsx's save/test/activate flow,
 * styled to match this page's cards rather than the Bulk SMS ones.
 */
function PushGatewaySettings() {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const [json, setJson] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data: gateway, isLoading } = useQuery({ queryKey: ['push-gateway'], queryFn: getPushGateway });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['push-gateway'] });

  const saveMutation = useMutation({
    mutationFn: () => updatePushGateway(json),
    onSuccess: () => {
      invalidate();
      setJson('');
      setTestResult(null);
      addNotification({ type: 'success', title: 'Settings saved', message: 'Firebase push credentials were updated.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Save failed', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const testMutation = useMutation({
    mutationFn: testPushGateway,
    onSuccess: (result) => setTestResult(result),
    onError: (err: any) => setTestResult({ ok: false, message: err?.response?.data?.message || 'Test failed. Please try again.' }),
  });

  const activateMutation = useMutation({
    mutationFn: activatePushGateway,
    onSuccess: () => {
      invalidate();
      addNotification({ type: 'success', title: 'Push notifications activated', message: 'New-case alerts will now be pushed to crew phones.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Could not activate', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivatePushGateway,
    onSuccess: () => {
      invalidate();
      addNotification({ type: 'success', title: 'Push notifications deactivated', message: 'Crew phones will no longer receive push alerts.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Could not deactivate', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const busy = saveMutation.isPending || testMutation.isPending || activateMutation.isPending || deactivateMutation.isPending;

  return (
    <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 border-b border-surface-border bg-slate-50 flex items-center gap-3">
        <Bell size={20} className="text-slate-text" />
        <h3 className="font-semibold text-brand-teal">Push Notifications (Firebase)</h3>
        {!isLoading && gateway?.isActive && (
          <span className="ml-auto flex items-center gap-1 text-sm font-medium text-brand-green"><CheckCircle size={16} /> Active</span>
        )}
        {!isLoading && !gateway?.isActive && gateway?.configured && (
          <span className="ml-auto flex items-center gap-1 text-sm font-medium text-slate-400"><XCircle size={16} /> Configured, not active</span>
        )}
      </div>

      <form
        className="p-6 flex flex-col gap-4"
        onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
      >
        <p className="text-sm text-slate-500">
          New-case alerts are pushed to the driver/EMT/nurse's phone once this is configured and active.
          {gateway?.projectId && <> Currently connected to Firebase project <strong>{gateway.projectId}</strong>.</>}
        </p>

        <div>
          <label className="block text-sm font-bold text-slate-800 mb-1.5" htmlFor="push-gateway-json">
            Firebase service-account JSON
          </label>
          <textarea
            id="push-gateway-json"
            className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-brand-teal"
            style={{ minHeight: 120, resize: 'vertical' }}
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder={gateway?.configured ? 'Paste a new key file to replace the saved one - leave blank to keep it.' : 'Paste the full JSON from Firebase Console → Project settings → Service accounts → Generate new private key'}
            autoComplete="off"
          />
        </div>

        {testResult && (
          <div className={`text-sm px-3 py-2 rounded-lg font-semibold ${testResult.ok ? 'bg-green-50 text-brand-green' : 'bg-red-50 text-status-danger'}`}>
            {testResult.message}
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-2">
            <button type="submit" className="flex items-center gap-1.5 px-4 py-2 bg-brand-teal text-white text-sm font-bold rounded-lg hover:opacity-90 disabled:opacity-40" disabled={busy || !json.trim()}>
              <Save size={14} /> {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-200 disabled:opacity-40"
              disabled={busy || !gateway?.configured}
              title={!gateway?.configured ? 'Save credentials first' : undefined}
              onClick={() => testMutation.mutate()}
            >
              <FlaskConical size={14} /> {testMutation.isPending ? 'Testing…' : 'Test connection'}
            </button>
          </div>
          {gateway?.isActive ? (
            <button
              type="button"
              className="flex items-center gap-1.5 px-4 py-2 text-slate-500 text-sm font-bold rounded-lg hover:bg-slate-50 disabled:opacity-40"
              disabled={busy}
              onClick={() => deactivateMutation.mutate()}
            >
              <CircleSlash size={14} /> Deactivate
            </button>
          ) : (
            <button
              type="button"
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-200 disabled:opacity-40"
              disabled={busy || !gateway?.configured}
              title={!gateway?.configured ? 'Save credentials first' : undefined}
              onClick={() => activateMutation.mutate()}
            >
              <PlugZap size={14} /> Set as active
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default PushGatewaySettings;
