import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquareText as ChatText,
  Send as PaperPlaneRight,
  History,
} from 'lucide-react';
import AppLoader from '@/components/shared/AppLoader';
import api from '@/api/client';
import { BulkSmsResult, Incident, SmsLogEntry } from '@/types/api';
import { useNotificationStore } from '@/stores/notificationStore';

// Canned starting points for common alert types. Purely client-side text -
// there's no backend template store anymore, so these aren't editable/shared.
const DEFAULT_TEMPLATES = [
  {
    key: 'GBV',
    label: 'GBV partner alert',
    body: 'EOC GBV ALERT {{caseNumber}} | Nature: {{nature}} | Location: {{location}} | Details: {{complaint}} | Reported: {{time}} | You are an assigned GBV partner - please respond and coordinate via EOC. {{maps}}',
  },
  {
    key: 'MCI',
    label: 'MCI partner alert',
    body: 'EOC MCI {{caseNumber}} | Location: {{location}} | Casualties: ~{{count}} | {{nature}} - {{complaint}} | Reported: {{time}} | MCI support requested - please respond and coordinate via EOC. {{maps}}',
  },
  {
    key: 'SURVEILLANCE',
    label: 'Surveillance alert',
    body: 'EOC SURVEILLANCE {{caseNumber}} | {{nature}} | Location: {{location}} | Details: {{complaint}} | Reported: {{time}} | Please review and advise. {{maps}}',
  },
];

// Fill template placeholders from a real case.
function fillFromCase(body: string, c: Incident): string {
  const when = c.alertAt || c.createdAt;
  const vars: Record<string, string> = {
    caseNumber: c.caseNumber ?? '',
    location: [c.locationName, c.subCounty].filter(Boolean).join(', '),
    count: c.massCasualtyCount != null ? String(c.massCasualtyCount) : '',
    nature: [c.alertNature, c.alertNatureDetail].filter(Boolean).join(' – ') || c.chiefComplaint || '',
    complaint: c.chiefComplaint ?? '',
    time: when
      ? new Date(when).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '',
    maps: c.lat != null && c.lng != null ? `Map: https://maps.google.com/?q=${c.lat},${c.lng}` : '',
  };
  return body.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '').replace(/\s{2,}/g, ' ').trim();
}

const GATEWAY_LABELS: Record<string, string> = {
  ADVANTA: 'Advanta',
  AFRICAS_TALKING: "Africa's Talking",
  TWILIO: 'Twilio',
  ADVANTA_ENV: 'Advanta (server)',
};
const gatewayLabel = (key: string | null) => (key ? GATEWAY_LABELS[key] ?? key : '-');

const CATEGORY_LABELS: Record<string, string> = { OTP: 'Login code', MANUAL: 'Bulk', TEST: 'Test', SYSTEM: 'System' };

const inputCls = 'w-full border rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-all';
const inputStyle = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' };
const card = 'rounded-xl border shadow-sm';
const cardStyle = { background: 'var(--surface)', borderColor: 'var(--border)' };

function BulkSmsPage() {
  const { addNotification } = useNotificationStore();

  const [message, setMessage] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [numbersText, setNumbersText] = useState('');
  const [lastResult, setLastResult] = useState<BulkSmsResult | null>(null);
  const queryClient = useQueryClient();

  const { data: recent = [], isLoading: recentLoading } = useQuery({
    queryKey: ['sms', 'messages'],
    queryFn: async () => (await api.get('/sms/messages?limit=50')).data.data as SmsLogEntry[],
    refetchInterval: 30_000,
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['sms', 'cases'],
    queryFn: async () => (await api.get('/incidents?limit=100')).data.data as Incident[],
    staleTime: 30_000,
  });

  const selectedCase = cases.find(c => c.id === selectedCaseId) ?? null;
  const hasUnfilledPlaceholders = /\{\{\w+\}\}/.test(message);

  // Insert a template - filled from the selected case when one is chosen.
  const insertTemplate = (body: string) =>
    setMessage(selectedCase ? fillFromCase(body, selectedCase) : body);

  const parsedNumbers = useMemo(
    () => numbersText.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean),
    [numbersText],
  );

  const sendMutation = useMutation({
    mutationFn: () => api.post('/sms/send', { message, numbers: parsedNumbers }),
    onSuccess: (res) => {
      const result = res.data.data as BulkSmsResult;
      setLastResult(result);
      queryClient.invalidateQueries({ queryKey: ['sms', 'messages'] });
      const via = Object.entries(result.byProvider ?? {}).map(([k, n]) => `${n} via ${gatewayLabel(k)}`).join(', ');
      addNotification({
        type: result.failed > 0 ? 'warning' : 'success',
        title: result.sent > 0 ? 'SMS sent' : 'SMS not sent',
        message: `${result.sent}/${result.total} accepted${result.failed ? `, ${result.failed} failed` : ''}`
          + (via ? ` (${via})` : '')
          + (result.duplicatesRemoved ? `. ${result.duplicatesRemoved} duplicate number(s) skipped.` : '.'),
      });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Send Failed', message: err?.response?.data?.message || 'Could not send SMS.' });
    },
  });

  return (
    <div className="col" style={{ gap: 24 }}>
      {/* Header */}
      <div className={`p-4 sm:p-6 lg:p-8 ${card}`} style={cardStyle}>
        <p className="font-sans text-[11px] font-black tracking-[0.2em] mb-1" style={{ color: 'var(--muted)' }}>
          Messaging
        </p>
        <h2 className="font-sans text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>
          Bulk SMS
        </h2>
      </div>

      {/* Compose */}
      <div className={`p-5 ${card}`} style={cardStyle}>
        <div className="flex items-center gap-2 mb-4">
          <ChatText size={18} className="text-brand-teal" />
          <h3 className="font-bold" style={{ color: 'var(--ink)' }}>Compose</h3>
        </div>

        {/* Compose from a case - fills the template with real case details */}
        <div className="mb-3">
          <label className="block text-[10px] font-black tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>
            Compose from a case (optional)
          </label>
          <select
            className={inputCls}
            style={inputStyle}
            value={selectedCaseId}
            onChange={e => setSelectedCaseId(e.target.value)}
          >
            <option value="">- No case · write manually -</option>
            {cases.map(c => (
              <option key={c.id} value={c.id}>
                {c.caseNumber} · {c.locationName}{c.isGbvCase ? ' · GBV' : ''}{c.massCasualty ? ' · MCI' : ''}
              </option>
            ))}
          </select>
          {selectedCase && (
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--muted)' }}>
              Pick a template below - it will be filled in with {selectedCase.caseNumber}'s details automatically.
            </p>
          )}
        </div>

        {/* Template picker */}
        <div className="flex flex-wrap gap-2 mb-3">
          {DEFAULT_TEMPLATES.map(t => (
            <button
              key={t.key}
              onClick={() => insertTemplate(t.body)}
              className="px-3 py-1.5 rounded-lg border text-xs font-bold transition-all"
              style={{ background: 'var(--surface-2)', color: 'var(--ink)', borderColor: 'var(--border)' }}
              title={selectedCase ? `Insert ${t.label} filled from ${selectedCase.caseNumber}` : `Insert ${t.label}`}
            >
              {selectedCase ? `Use: ${t.label}` : t.label}
            </button>
          ))}
        </div>

        <textarea
          className={inputCls}
          style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
          placeholder="Type your message, or pick a case + template above to compose it for you."
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
            {message.length} chars · {Math.max(1, Math.ceil(message.length / 160))} SMS segment(s)
          </p>
          {hasUnfilledPlaceholders && (
            <p className="text-[11px] font-bold text-amber-500">
              ⚠ Message still has {'{{…}}'} - pick a case or edit them out before sending.
            </p>
          )}
        </div>
      </div>

      {/* Recipients */}
      <div className={`p-5 ${card}`} style={cardStyle}>
        <div className="flex items-center gap-2 mb-4">
          <ChatText size={18} className="text-brand-teal" />
          <h3 className="font-bold" style={{ color: 'var(--ink)' }}>Recipients</h3>
          <span className="text-xs ml-auto" style={{ color: 'var(--muted)' }}>
            {parsedNumbers.length ? `${parsedNumbers.length} number(s)` : 'none'}
          </span>
        </div>

        <textarea
          className={inputCls}
          style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
          placeholder="Enter numbers separated by commas or new lines, e.g. 0712345678, 254701234567"
          value={numbersText}
          onChange={e => setNumbersText(e.target.value)}
        />

        {lastResult && lastResult.errors.length > 0 && (
          <div className="mt-4 rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2">
            {lastResult.errors.map((e, i) => (
              <p key={i} className="text-xs font-semibold text-status-danger">{e.number}: {e.error}</p>
            ))}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          {lastResult && (
            <p className="text-xs font-bold" style={{ color: 'var(--muted)' }}>
              Last: {lastResult.sent} sent · {lastResult.failed} failed
            </p>
          )}
          <button
            onClick={() => sendMutation.mutate()}
            disabled={!message.trim() || !parsedNumbers.length || hasUnfilledPlaceholders || sendMutation.isPending}
            className="ml-auto flex items-center gap-2 px-6 py-3 bg-brand-teal text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-40"
          >
            {sendMutation.isPending ? <AppLoader size={20} /> : <PaperPlaneRight size={16} />}
            {sendMutation.isPending ? 'Sending…' : 'Send SMS'}
          </button>
        </div>
      </div>

      {/* Recent sends - bulk, login codes and gateway tests */}
      <div className={`p-5 ${card}`} style={cardStyle}>
        <div className="flex items-center gap-2 mb-4">
          <History size={18} className="text-brand-teal" />
          <h3 className="font-bold" style={{ color: 'var(--ink)' }}>Recent SMS</h3>
          <span className="text-xs ml-auto" style={{ color: 'var(--muted)' }}>Bulk sends, crew login codes and gateway tests</span>
        </div>
        {recentLoading ? (
          <div className="py-6 flex justify-center"><AppLoader size={24} /></div>
        ) : recent.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Nothing sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--muted)' }} className="text-left">
                  <th className="py-2 pr-3 font-bold">When</th>
                  <th className="py-2 pr-3 font-bold">To</th>
                  <th className="py-2 pr-3 font-bold">Type</th>
                  <th className="py-2 pr-3 font-bold">Status</th>
                  <th className="py-2 pr-3 font-bold">Gateway</th>
                  <th className="py-2 font-bold">Message / reason</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((m) => (
                  <tr key={m.id} className="border-t align-top" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {new Date(m.createdAt).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{m.recipient}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{CATEGORY_LABELS[m.category] ?? m.category}</td>
                    <td className="py-2 pr-3">
                      <span className={`pill ${m.status === 'SENT' ? 'pill-green' : 'pill-red'}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                        {m.status === 'SENT' ? 'Sent' : 'Failed'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{gatewayLabel(m.provider)}</td>
                    <td className="py-2" style={{ maxWidth: 420 }}>
                      <span className="line-clamp-2">{m.message}</span>
                      {m.error && (
                        <span className="block mt-0.5" style={{ color: m.status === 'SENT' ? 'var(--muted)' : 'var(--red)' }}>{m.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default BulkSmsPage;
