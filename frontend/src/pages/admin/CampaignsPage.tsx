import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Users, Ambulance, Send, Check, Smartphone, Search, BellRing } from 'lucide-react';
import api from '@/api/client';
import AppLoader from '@/components/shared/AppLoader';
import LoadingState from '@/components/shared/LoadingState';
import { confirmDialog } from '@/lib/alert';
import { useNotificationStore } from '@/stores/notificationStore';

/**
 * Push campaigns: an admin sends a one-off notification to every crew member,
 * or to the crew on chosen ambulances - e.g. "New app update available".
 * Backed by /campaigns (backend/src/modules/campaigns). Each send is logged.
 */

interface AudienceVehicle {
  id: string;
  registrationNumber: string;
  status: string;
  crew: { id: string; name: string }[];
}
interface Audience {
  allCrew: { users: number; devices: number };
  vehicles: AudienceVehicle[];
}
interface CampaignResult {
  title: string;
  message: string;
  audience: 'ALL_CREW' | 'VEHICLES';
  vehicleRegs: string[];
  recipients: number;
  devices: number;
  sent: number;
  failed: number;
  errors?: string[];
}
interface CampaignLog extends CampaignResult {
  id: string;
  sentAt: string;
  sentBy: string | null;
}

const TITLE_MAX = 65;
const MESSAGE_MAX = 240;

const TEMPLATES = [
  { label: 'App update', title: 'New app update available', message: 'A new version of the EOC crew app is ready. Update it from the link shared by the EOC, then sign in again.' },
  { label: 'Shift briefing', title: 'Shift briefing', message: 'All crews: briefing at the EOC at 08:00. Check in to your ambulance before attending.' },
  { label: 'Checklist reminder', title: 'Complete your checklist', message: 'Please complete the vehicle checklist and draw your stock before taking calls this shift.' },
  { label: 'System maintenance', title: 'Planned system maintenance', message: 'The EOC system will be briefly unavailable tonight from 23:00. Call dispatch on the radio if the app does not respond.' },
];

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Counter({ value, max }: { value: number; max: number }) {
  const over = value > max * 0.9;
  return <span className="text-[11.5px] tabular-nums" style={{ color: over ? 'var(--amber)' : 'var(--muted)' }}>{value}/{max}</span>;
}

function CampaignsPage() {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<'ALL_CREW' | 'VEHICLES'>('ALL_CREW');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [lastResult, setLastResult] = useState<CampaignResult | null>(null);

  const { data: aud, isLoading: audLoading } = useQuery({
    queryKey: ['campaigns', 'audience'],
    queryFn: async () => (await api.get('/campaigns/audience')).data.data as Audience,
  });
  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ['campaigns', 'history'],
    queryFn: async () => (await api.get('/campaigns')).data.data as CampaignLog[],
  });

  const vehicles = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (aud?.vehicles ?? []).filter(
      (v) => !q || v.registrationNumber.toLowerCase().includes(q) || v.crew.some((c) => c.name.toLowerCase().includes(q)),
    );
  }, [aud, filter]);

  const pickedVehicles = (aud?.vehicles ?? []).filter((v) => picked.has(v.id));
  const pickedCrew = new Set(pickedVehicles.flatMap((v) => v.crew.map((c) => c.id))).size;
  const reach = audience === 'ALL_CREW' ? (aud?.allCrew.users ?? 0) : pickedCrew;

  const canSend =
    title.trim().length >= 3 && message.trim().length >= 3 && title.length <= TITLE_MAX && message.length <= MESSAGE_MAX
    && (audience === 'ALL_CREW' || picked.size > 0) && reach > 0;

  const send = useMutation({
    mutationFn: async () =>
      (await api.post('/campaigns', {
        title: title.trim(),
        message: message.trim(),
        audience,
        vehicleIds: audience === 'VEHICLES' ? [...picked] : undefined,
      })).data.data as CampaignResult,
    onSuccess: (r) => {
      setLastResult(r);
      queryClient.invalidateQueries({ queryKey: ['campaigns', 'history'] });
      addNotification({ type: 'success', title: 'Campaign sent', message: `Delivered to ${r.sent} of ${r.devices} devices.` });
      setTitle('');
      setMessage('');
      setPicked(new Set());
    },
    onError: (err: any) =>
      addNotification({ type: 'error', title: 'Not sent', message: err?.response?.data?.message || 'Could not send the campaign.' }),
  });

  const confirmAndSend = async () => {
    const who = audience === 'ALL_CREW'
      ? `all ${reach} crew members`
      : `${reach} crew on ${pickedVehicles.map((v) => v.registrationNumber).join(', ')}`;
    const ok = await confirmDialog({
      title: 'Send this notification?',
      text: `"${title.trim()}" goes to ${who} straight away. It can't be recalled.`,
      confirmLabel: 'Send now',
    });
    if (ok) send.mutate();
  };

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="col" style={{ gap: 20 }}>
      {/* Header */}
      <div className="card card-pad flex items-center gap-4 flex-wrap">
        <span className="w-12 h-12 rounded-xl grid place-items-center" style={{ background: 'var(--green-light)' }}>
          <Megaphone size={22} color="var(--green)" />
        </span>
        <div className="min-w-0">
          <p className="eyebrow">Messaging</p>
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--ink)' }}>Campaigns</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            Send a push notification to every crew member, or only to the crews on chosen ambulances.
          </p>
        </div>
        {aud && (
          <div className="ml-auto text-right">
            <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{aud.allCrew.users}</div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>crew accounts · {aud.allCrew.devices} devices with alerts on</div>
          </div>
        )}
      </div>

      {lastResult && (
        <div
          className="rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ background: lastResult.failed ? 'var(--amber-soft)' : 'var(--green-light)', border: '1px solid var(--border)' }}
        >
          <Check size={18} className="mt-0.5 shrink-0" style={{ color: lastResult.failed ? 'var(--amber)' : 'var(--green)' }} />
          <div className="text-sm" style={{ color: 'var(--ink)' }}>
            <b>"{lastResult.title}"</b> reached {lastResult.sent} of {lastResult.devices} devices ({lastResult.recipients} people).
            {lastResult.devices < lastResult.recipients && (
              <span style={{ color: 'var(--muted)' }}> Some crew haven't turned on alerts in the app, so they won't see it.</span>
            )}
            {lastResult.failed > 0 && lastResult.errors?.[0] && (
              <span className="block text-xs mt-1" style={{ color: 'var(--amber)' }}>Failed deliveries: {lastResult.errors[0]}</span>
            )}
          </div>
          <button className="ml-auto text-xs font-semibold" style={{ color: 'var(--muted)' }} onClick={() => setLastResult(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] items-start">
        {/* Compose */}
        <div className="card card-pad col" style={{ gap: 22 }}>
          <section>
            <p className="label mb-2">START FROM A TEMPLATE</p>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  className="text-[12.5px] font-semibold px-3 py-1.5 rounded-full border transition-colors"
                  style={{ borderColor: 'var(--border-strong)', color: 'var(--ink-2)', background: 'var(--surface)' }}
                  onClick={() => { setTitle(t.title); setMessage(t.message); }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <section className="col" style={{ gap: 14 }}>
            <div>
              <div className="flex items-center mb-1.5">
                <label htmlFor="cmp-title" className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>Title</label>
                <span className="ml-auto"><Counter value={title.length} max={TITLE_MAX} /></span>
              </div>
              <input
                id="cmp-title"
                className="input"
                maxLength={TITLE_MAX}
                placeholder="e.g. New app update available"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <div className="flex items-center mb-1.5">
                <label htmlFor="cmp-msg" className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>Message</label>
                <span className="ml-auto"><Counter value={message.length} max={MESSAGE_MAX} /></span>
              </div>
              <textarea
                id="cmp-msg"
                className="eoc-textarea"
                rows={4}
                maxLength={MESSAGE_MAX}
                placeholder="What should the crews know or do?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className="text-[11.5px] mt-1" style={{ color: 'var(--muted)' }}>Short and clear: phones show about two lines before cutting off.</p>
            </div>
          </section>

          <section>
            <p className="label mb-2">SEND TO</p>
            <div className="grid sm:grid-cols-2 gap-2.5" role="radiogroup">
              {([
                { v: 'ALL_CREW', title: 'All crew', sub: `${aud?.allCrew.users ?? '…'} drivers, EMTs and nurses`, Icon: Users },
                { v: 'VEHICLES', title: 'Selected ambulances', sub: 'Only the crew on them right now', Icon: Ambulance },
              ] as const).map(({ v, title: t, sub, Icon }) => {
                const on = audience === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setAudience(v)}
                    className="flex items-center gap-3 text-left p-3.5 rounded-xl border transition-colors"
                    style={on
                      ? { borderColor: 'var(--green)', background: 'var(--green-light)', boxShadow: '0 0 0 1px var(--green)' }
                      : { borderColor: 'var(--border-strong)', background: 'var(--surface)' }}
                  >
                    <span className="w-10 h-10 rounded-lg grid place-items-center shrink-0" style={{ background: on ? 'var(--green)' : 'var(--surface-3)' }}>
                      <Icon size={18} color={on ? '#fff' : 'var(--muted)'} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold" style={{ color: 'var(--ink)' }}>{t}</span>
                      <span className="block text-xs truncate" style={{ color: 'var(--muted)' }}>{sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {audience === 'VEHICLES' && (
              <div className="mt-3 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  <Search size={14} color="var(--muted)" />
                  <input
                    className="flex-1 bg-transparent outline-none text-sm"
                    placeholder="Search registration or crew name"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                  <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{picked.size} selected</span>
                </div>
                {audLoading ? (
                  <LoadingState minHeight={120} label="Loading ambulances…" />
                ) : (
                  <ul className="max-h-[320px] overflow-y-auto">
                    {vehicles.map((v) => {
                      const on = picked.has(v.id);
                      const empty = v.crew.length === 0;
                      return (
                        <li key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <label className={`flex items-center gap-3 px-3 py-2.5 ${empty ? 'opacity-60' : 'cursor-pointer'}`}>
                            <input
                              type="checkbox"
                              className="w-4 h-4"
                              style={{ accentColor: 'var(--green)' }}
                              checked={on}
                              disabled={empty}
                              onChange={() => toggle(v.id)}
                            />
                            <span
                              className="text-[12px] font-black tracking-wider px-2 py-0.5 rounded"
                              style={{ background: '#F7D23E', color: '#111', border: '1.5px solid #111' }}
                            >
                              {v.registrationNumber.toUpperCase()}
                            </span>
                            <span className="text-[13px] truncate" style={{ color: empty ? 'var(--muted)' : 'var(--ink-2)' }}>
                              {empty ? 'No one checked in' : v.crew.map((c) => c.name.split(' ')[0]).join(', ')}
                            </span>
                            {!empty && <span className="ml-auto text-xs shrink-0" style={{ color: 'var(--muted)' }}>{v.crew.length} crew</span>}
                          </label>
                        </li>
                      );
                    })}
                    {vehicles.length === 0 && <li className="px-3 py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>No ambulances match.</li>}
                  </ul>
                )}
              </div>
            )}
          </section>

          <div className="flex items-center gap-3 flex-wrap pt-1" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <span className="text-sm" style={{ color: 'var(--muted)' }}>
              Reaches <b style={{ color: 'var(--ink)' }}>{reach}</b> {reach === 1 ? 'person' : 'people'}
            </span>
            <button className="btn btn-primary ml-auto" style={{ minWidth: 200 }} disabled={!canSend || send.isPending} onClick={confirmAndSend}>
              {send.isPending ? <AppLoader size={18} /> : <Send size={16} />}
              {send.isPending ? 'Sending…' : 'Send notification'}
            </button>
          </div>
        </div>

        {/* Phone preview */}
        <div className="card card-pad col" style={{ gap: 12 }}>
          <p className="label flex items-center gap-1.5"><Smartphone size={13} /> PREVIEW</p>
          <div className="rounded-[28px] p-3" style={{ background: 'var(--nav-bg)' }}>
            <div className="text-center text-white/70 text-[11px] mb-3 tabular-nums">
              {new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="rounded-2xl p-3 flex gap-2.5" style={{ background: 'rgba(255,255,255,0.94)' }}>
              <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0" style={{ background: 'var(--green)' }}>
                <BellRing size={15} color="#fff" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold" style={{ color: '#475569' }}>EOC CREW</span>
                  <span className="text-[11px]" style={{ color: '#94A3B8' }}>· now</span>
                </div>
                <p className="text-[13px] font-bold truncate" style={{ color: '#0F172A' }}>{title.trim() || 'Notification title'}</p>
                <p className="text-[12.5px] leading-snug" style={{ color: '#334155', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {message.trim() || 'Your message appears here.'}
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Arrives on crew phones that have alerts turned on, even when the app is closed.
          </p>
        </div>
      </div>

      {/* History */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-head">
          <div>
            <div className="eyebrow">History</div>
            <div className="card-title">Sent campaigns</div>
          </div>
        </div>
        {historyLoading ? (
          <LoadingState minHeight={140} label="Loading history…" />
        ) : history.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>No campaigns sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[720px]">
              <thead>
                <tr style={{ background: 'var(--surface-2)', color: 'var(--muted)' }} className="text-[11.5px] font-semibold">
                  <th className="px-5 py-2.5">Sent</th>
                  <th className="px-5 py-2.5">Notification</th>
                  <th className="px-5 py-2.5">Audience</th>
                  <th className="px-5 py-2.5 text-right">Delivered</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-5 py-3 align-top whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
                      {fmtWhen(h.sentAt)}
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>{h.sentBy ?? '-'}</div>
                    </td>
                    <td className="px-5 py-3 align-top max-w-[420px]">
                      <div className="font-semibold" style={{ color: 'var(--ink)' }}>{h.title}</div>
                      <div className="text-xs line-clamp-2" style={{ color: 'var(--muted)' }}>{h.message}</div>
                    </td>
                    <td className="px-5 py-3 align-top" style={{ color: 'var(--ink-2)' }}>
                      {h.audience === 'ALL_CREW' ? 'All crew' : h.vehicleRegs?.join(', ')}
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>{h.recipients} people</div>
                    </td>
                    <td className="px-5 py-3 align-top text-right tabular-nums" style={{ color: h.failed ? 'var(--amber)' : 'var(--ink)' }}>
                      {h.sent}/{h.devices}
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>devices</div>
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

export default CampaignsPage;
