import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Timer, Plus, CircleStop, X as XIcon, MapPin, CalendarClock, Users, BellRing, Search, Trophy, Megaphone,
  Hospital, PartyPopper, GraduationCap, Route, Check, History,
} from 'lucide-react';
import AppLoader from '@/components/shared/AppLoader';
import LoadingState from '@/components/shared/LoadingState';
import api from '@/api/client';
import { Vehicle } from '@/types/api';
import { useNotificationStore } from '@/stores/notificationStore';
import { confirmDialog } from '@/lib/alert';
import { fmtDateTime, toNairobiInput, nairobiInputToISO } from '@/lib/datetime';
import { vehicleMedics } from '@/utils/crew';

/**
 * Fleet standby: ambulances parked at an event or location (a match, a rally,
 * a hospital). Placing one on standby pushes the event, place and start time
 * to the crew checked in to it; ending it tells them they're released.
 */

interface StandbyRow {
  id: string;
  vehicleId: string;
  vehicle?: { id: string; registrationNumber: string };
  title: string;
  location?: string | null;
  notes?: string | null;
  startedAt: string;
  endedAt?: string | null;
}

const EVENT_PRESETS: { label: string; Icon: typeof Trophy }[] = [
  { label: 'Football match', Icon: Trophy },
  { label: 'Political rally', Icon: Megaphone },
  { label: 'Public event', Icon: PartyPopper },
  { label: 'School event', Icon: GraduationCap },
  { label: 'Hospital standby', Icon: Hospital },
  { label: 'Road race / convoy', Icon: Route },
];

function duration(fromIso: string, toIso?: string | null, now = Date.now()) {
  const ms = (toIso ? new Date(toIso).getTime() : now) - new Date(fromIso).getTime();
  if (ms < 0) return 'starts soon';
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${String(mins % 60).padStart(2, '0')}m`;
  return `${mins}m`;
}

function crewOf(v?: Vehicle) {
  if (!v) return [];
  return [
    ...(v.currentDriver ? [{ name: v.currentDriver.name, role: 'Driver' }] : []),
    ...vehicleMedics(v).map((m) => ({ name: m.person.name, role: m.role })),
  ];
}

function Plate({ reg, size = 13 }: { reg: string; size?: number }) {
  return (
    <span
      className="font-black tracking-wider px-2 py-0.5 rounded-md inline-block"
      style={{ fontSize: size, background: '#F7D23E', color: '#111', border: '2px solid #111' }}
    >
      {reg.toUpperCase()}
    </span>
  );
}

/** Ticks once a minute so live durations stay current. */
function useMinuteTick() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const field = 'w-full h-11 px-3.5 rounded-xl border text-sm outline-none transition-[border-color,box-shadow] focus:border-[var(--green)] focus:shadow-[0_0_0_3px_var(--ring)]';
const fieldStyle = { background: 'var(--surface)', borderColor: 'var(--border-strong)', color: 'var(--ink)' } as const;

function StandbyPage() {
  const [showModal, setShowModal] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('');
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();
  const now = useMinuteTick();

  const { data: vehicles = [] } = useQuery({
    queryKey: ['dispatch', 'vehicles'],
    queryFn: async () => (await api.get('/dispatch/vehicles')).data.data as Vehicle[],
    staleTime: 30_000,
  });

  const { data: standbys = [], isLoading } = useQuery({
    queryKey: ['fleet', 'standby'],
    queryFn: async () => (await api.get('/fleet/standby')).data.data as StandbyRow[],
    refetchInterval: 60_000,
  });

  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const active = standbys.filter((s) => !s.endedAt);
  const ended = standbys.filter((s) => s.endedAt);
  const onStandbyIds = new Set(active.map((s) => s.vehicleId));
  const today = new Date().toDateString();
  const endedToday = ended.filter((s) => new Date(s.endedAt!).toDateString() === today).length;
  const crewOnStandby = active.reduce((n, s) => n + crewOf(vehicleById.get(s.vehicleId)).length, 0);

  const endMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/fleet/standby/${id}/end`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleet', 'standby'] });
      addNotification({ type: 'success', title: 'Standby ended', message: 'The crew has been told they are released.' });
    },
    onError: (err: any) =>
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not end standby.' }),
  });

  const endStandby = async (s: StandbyRow) => {
    const ok = await confirmDialog({
      title: `End standby for ${s.vehicle?.registrationNumber ?? 'this ambulance'}?`,
      text: `"${s.title}" ends now and the crew is told they're released.`,
      confirmLabel: 'End standby',
      danger: true,
    });
    if (ok) endMutation.mutate(s.id);
  };

  const filteredHistory = ended.filter((s) => {
    const q = historyFilter.trim().toLowerCase();
    return !q || [s.vehicle?.registrationNumber, s.title, s.location].some((x) => x?.toLowerCase().includes(q));
  });

  return (
    <div className="col" style={{ gap: 20 }}>
      {/* Header */}
      <div className="card card-pad flex flex-col lg:flex-row lg:items-center gap-5">
        <div className="flex items-center gap-4 min-w-0">
          <span className="w-12 h-12 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--green-light)' }}>
            <Timer size={22} color="var(--green)" />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">Fleet</p>
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--ink)' }}>Standby</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
              Ambulances placed at events or locations. The crew is notified when a standby starts and ends.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 lg:ml-auto">
          {[
            { label: 'On standby now', value: active.length, accent: active.length > 0 },
            { label: 'Crew on standby', value: crewOnStandby },
            { label: 'Ended today', value: endedToday },
          ].map((s) => (
            <div key={s.label} className="text-right">
              <div className="text-2xl font-bold tabular-nums" style={{ color: s.accent ? 'var(--green)' : 'var(--ink)' }}>{s.value}</div>
              <div className="text-xs whitespace-nowrap" style={{ color: 'var(--muted)' }}>{s.label}</div>
            </div>
          ))}
          <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ height: 44 }}>
            <Plus size={17} /> Place on standby
          </button>
        </div>
      </div>

      {/* Live standbys */}
      <section className="col" style={{ gap: 12 }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full live-dot" style={{ background: 'var(--green)' }} />
          <h3 className="text-sm font-bold tracking-wide" style={{ color: 'var(--ink)' }}>ON STANDBY NOW</h3>
        </div>
        {isLoading ? (
          <div className="card"><LoadingState minHeight={160} label="Loading standbys…" /></div>
        ) : active.length === 0 ? (
          <div className="card card-pad flex flex-col items-center text-center gap-3" style={{ padding: 40 }}>
            <span className="w-14 h-14 rounded-2xl grid place-items-center" style={{ background: 'var(--surface-3)' }}>
              <Timer size={26} color="var(--muted)" />
            </span>
            <div>
              <p className="font-bold" style={{ color: 'var(--ink)' }}>No ambulance on standby</p>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Place one at a match, rally or other event and its crew gets the details on their phones.</p>
            </div>
            <button onClick={() => setShowModal(true)} className="btn btn-primary btn-sm"><Plus size={15} /> Place on standby</button>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {active.map((s) => {
              const crew = crewOf(vehicleById.get(s.vehicleId));
              const upcoming = new Date(s.startedAt).getTime() > now;
              return (
                <article key={s.id} className="card overflow-hidden flex flex-col" style={{ borderTop: '3px solid var(--green)' }}>
                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <div className="flex items-center gap-2">
                      <Plate reg={s.vehicle?.registrationNumber ?? '—'} />
                      <span
                        className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: upcoming ? 'var(--amber-soft)' : 'var(--green-light)', color: upcoming ? 'var(--amber)' : 'var(--green)' }}
                      >
                        {upcoming ? 'Scheduled' : 'Active'}
                      </span>
                    </div>
                    <div>
                      <p className="text-[16px] font-bold leading-snug" style={{ color: 'var(--ink)' }}>{s.title}</p>
                      {s.location && (
                        <p className="text-sm mt-1 flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
                          <MapPin size={14} color="var(--muted)" /> {s.location}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                        <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{upcoming ? 'Starts' : 'Started'}</div>
                        <div className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>{fmtDateTime(s.startedAt)}</div>
                      </div>
                      <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                        <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{upcoming ? 'Starts in' : 'On standby for'}</div>
                        <div className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--green)' }}>
                          {upcoming ? duration(new Date(now).toISOString(), s.startedAt, now) : duration(s.startedAt, null, now)}
                        </div>
                      </div>
                    </div>
                    <div className="text-[12.5px] flex items-start gap-1.5" style={{ color: crew.length ? 'var(--ink-2)' : 'var(--amber)' }}>
                      <Users size={14} className="mt-0.5 shrink-0" color="var(--muted)" />
                      {crew.length ? crew.map((c) => c.name.split(' ')[0]).join(', ') : 'No crew checked in - nobody was notified'}
                    </div>
                    {s.notes && <p className="text-[12.5px] italic" style={{ color: 'var(--muted)' }}>“{s.notes}”</p>}
                  </div>
                  <div className="px-4 py-3 flex justify-end" style={{ borderTop: '1px solid var(--border)' }}>
                    <button
                      onClick={() => endStandby(s)}
                      disabled={endMutation.isPending}
                      className="btn btn-sm"
                      style={{ border: '1.5px solid var(--red)', color: 'var(--red)', background: 'transparent' }}
                    >
                      {endMutation.isPending && endMutation.variables === s.id ? <AppLoader size={16} /> : <CircleStop size={15} />}
                      End standby
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* History */}
      <section className="card" style={{ overflow: 'hidden' }}>
        <div className="card-head flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <History size={16} color="var(--muted)" />
            <div>
              <div className="card-title">History</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>{ended.length} completed standbys</div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 h-9 rounded-lg border ml-auto" style={{ borderColor: 'var(--border)' }}>
            <Search size={14} color="var(--muted)" />
            <input
              className="bg-transparent outline-none text-sm w-48"
              placeholder="Search vehicle, event, place"
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
            />
          </div>
        </div>
        {isLoading ? (
          <LoadingState minHeight={120} label="Loading history…" />
        ) : filteredHistory.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
            {ended.length === 0 ? 'Finished standbys will appear here.' : 'No standbys match your search.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[760px]">
              <thead>
                <tr className="text-[11.5px] font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>
                  <th className="px-5 py-2.5">Ambulance</th>
                  <th className="px-5 py-2.5">Event</th>
                  <th className="px-5 py-2.5">Location</th>
                  <th className="px-5 py-2.5">Started</th>
                  <th className="px-5 py-2.5">Ended</th>
                  <th className="px-5 py-2.5 text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((s) => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-5 py-3"><Plate reg={s.vehicle?.registrationNumber ?? '—'} size={12} /></td>
                    <td className="px-5 py-3 font-semibold" style={{ color: 'var(--ink)' }}>{s.title}</td>
                    <td className="px-5 py-3" style={{ color: 'var(--ink-2)' }}>{s.location || '—'}</td>
                    <td className="px-5 py-3 text-xs" style={{ color: 'var(--muted)' }}>{fmtDateTime(s.startedAt)}</td>
                    <td className="px-5 py-3 text-xs" style={{ color: 'var(--muted)' }}>{fmtDateTime(s.endedAt!)}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{duration(s.startedAt, s.endedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showModal && (
        <PlaceOnStandbyModal
          vehicles={vehicles}
          onStandbyIds={onStandbyIds}
          onClose={() => setShowModal(false)}
          onDone={(crewNotified, reg) => {
            setShowModal(false);
            queryClient.invalidateQueries({ queryKey: ['fleet', 'standby'] });
            addNotification({
              type: 'success',
              title: `${reg} on standby`,
              message: crewNotified > 0
                ? `${crewNotified} crew member${crewNotified === 1 ? '' : 's'} notified on their phones.`
                : 'No crew is checked in, so nobody was notified.',
            });
          }}
        />
      )}
    </div>
  );
}

function PlaceOnStandbyModal({
  vehicles, onStandbyIds, onClose, onDone,
}: {
  vehicles: Vehicle[];
  onStandbyIds: Set<string>;
  onClose: () => void;
  onDone: (crewNotified: number, reg: string) => void;
}) {
  const { addNotification } = useNotificationStore();
  const [vehicleId, setVehicleId] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [startedAt, setStartedAt] = useState(toNairobiInput());
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');

  const selectable = (v: Vehicle) => v.isActive && v.status !== 'BUSY' && v.status !== 'MAINTENANCE' && !onStandbyIds.has(v.id);
  const list = vehicles
    .filter((v) => v.isActive)
    .filter((v) => {
      const q = query.trim().toLowerCase();
      return !q || v.registrationNumber.toLowerCase().includes(q) || crewOf(v).some((c) => c.name.toLowerCase().includes(q));
    })
    .sort((a, b) => Number(selectable(b)) - Number(selectable(a)) || a.registrationNumber.localeCompare(b.registrationNumber));

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const crew = crewOf(vehicle);
  const valid = !!vehicleId && title.trim().length >= 2;
  const whenText = startedAt
    ? new Date(nairobiInputToISO(startedAt) ?? Date.now()).toLocaleString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  const create = useMutation({
    mutationFn: async () =>
      (await api.post('/fleet/standby', {
        vehicleId,
        title: title.trim(),
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
        startedAt: nairobiInputToISO(startedAt),
      })).data.data as StandbyRow & { crewNotified?: number },
    onSuccess: (row) => onDone(row.crewNotified ?? crew.length, row.vehicle?.registrationNumber ?? vehicle?.registrationNumber ?? ''),
    onError: (err: any) =>
      addNotification({ type: 'error', title: 'Not placed on standby', message: err?.response?.data?.message || 'Could not log standby.' }),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !create.isPending && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, create.isPending]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="standby-title">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !create.isPending && onClose()} />
      <div className="relative w-full max-w-4xl max-h-[94vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)' }}>
        {/* Head */}
        <div className="px-6 py-4 flex items-center gap-3" style={{ background: 'var(--nav-bg)' }}>
          <span className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <Timer size={18} color="#5FD79A" />
          </span>
          <div>
            <p id="standby-title" className="text-[15px] font-bold text-white">Place ambulance on standby</p>
            <p className="text-xs" style={{ color: 'var(--nav-muted)' }}>The crew on board gets the event, place and time on their phones.</p>
          </div>
          <button onClick={onClose} disabled={create.isPending} className="ml-auto p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10" aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto grid md:grid-cols-[minmax(0,1fr)_300px]">
          {/* Form */}
          <div className="p-6 col" style={{ gap: 20 }}>
            {/* 1. Ambulance */}
            <section>
              <div className="flex items-center mb-2">
                <p className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>1. Ambulance <span style={{ color: 'var(--red)' }}>*</span></p>
                <div className="ml-auto flex items-center gap-1.5 px-2.5 h-8 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                  <Search size={13} color="var(--muted)" />
                  <input className="bg-transparent outline-none text-xs w-32" placeholder="Find…" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1" role="radiogroup">
                {list.map((v) => {
                  const ok = selectable(v);
                  const on = v.id === vehicleId;
                  const vc = crewOf(v);
                  const why = onStandbyIds.has(v.id) ? 'Already on standby' : v.status === 'BUSY' ? 'On a case' : v.status === 'MAINTENANCE' ? 'Out of service' : null;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={!ok}
                      onClick={() => setVehicleId(v.id)}
                      className="text-left p-3 rounded-xl border transition-colors disabled:cursor-not-allowed"
                      style={on
                        ? { borderColor: 'var(--green)', background: 'var(--green-light)', boxShadow: '0 0 0 1px var(--green)' }
                        : { borderColor: 'var(--border)', background: ok ? 'var(--surface)' : 'var(--surface-2)', opacity: ok ? 1 : 0.6 }}
                    >
                      <div className="flex items-center gap-2">
                        <Plate reg={v.registrationNumber} size={12} />
                        {on ? <Check size={16} color="var(--green)" className="ml-auto" /> : why && <span className="ml-auto text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>{why}</span>}
                      </div>
                      <div className="text-xs mt-1.5 truncate" style={{ color: vc.length ? 'var(--ink-2)' : 'var(--amber)' }}>
                        {vc.length ? vc.map((c) => c.name.split(' ')[0]).join(', ') : 'No crew checked in'}
                      </div>
                    </button>
                  );
                })}
                {list.length === 0 && <p className="text-sm py-4" style={{ color: 'var(--muted)' }}>No ambulances match.</p>}
              </div>
            </section>

            {/* 2. Event */}
            <section>
              <label htmlFor="sb-title" className="block text-[13px] font-semibold mb-2" style={{ color: 'var(--ink)' }}>
                2. Event or reason <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {EVENT_PRESETS.map(({ label, Icon }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setTitle(label)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full border transition-colors"
                    style={title === label
                      ? { borderColor: 'var(--green)', background: 'var(--green-light)', color: 'var(--green)' }
                      : { borderColor: 'var(--border-strong)', color: 'var(--ink-2)', background: 'var(--surface)' }}
                  >
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>
              <input id="sb-title" className={field} style={fieldStyle} placeholder="e.g. Machakos Derby - Kenya Police vs Gor Mahia" value={title} onChange={(e) => setTitle(e.target.value)} />
            </section>

            {/* 3. Where & when */}
            <section className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="sb-loc" className="block text-[13px] font-semibold mb-2" style={{ color: 'var(--ink)' }}>3. Location</label>
                <div className="relative">
                  <MapPin size={15} color="var(--muted)" className="absolute left-3 top-1/2 -translate-y-1/2" />
                  <input id="sb-loc" className={`${field} pl-9`} style={fieldStyle} placeholder="e.g. Kenyatta Stadium, Machakos" value={location} onChange={(e) => setLocation(e.target.value)} />
                </div>
              </div>
              <div>
                <div className="flex items-center mb-2">
                  <label htmlFor="sb-time" className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>4. Start time</label>
                  <button type="button" className="ml-auto text-xs font-semibold" style={{ color: 'var(--green)' }} onClick={() => setStartedAt(toNairobiInput())}>
                    Now
                  </button>
                </div>
                <input id="sb-time" type="datetime-local" className={field} style={fieldStyle} value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
              </div>
            </section>

            <section>
              <label htmlFor="sb-notes" className="block text-[13px] font-semibold mb-2" style={{ color: 'var(--ink)' }}>
                Instructions for the crew <span className="font-normal" style={{ color: 'var(--muted)' }}>(optional)</span>
              </label>
              <textarea
                id="sb-notes"
                rows={2}
                maxLength={160}
                className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none resize-none focus:border-[var(--green)] focus:shadow-[0_0_0_3px_var(--ring)]"
                style={fieldStyle}
                placeholder="e.g. Park at Gate C, report to the event medical officer"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </section>
          </div>

          {/* Crew preview */}
          <aside className="p-6 col" style={{ gap: 14, background: 'var(--surface-2)', borderLeft: '1px solid var(--border)' }}>
            <p className="label flex items-center gap-1.5"><BellRing size={13} /> WHAT THE CREW WILL GET</p>
            <div className="rounded-[24px] p-3" style={{ background: 'var(--nav-bg)' }}>
              <div className="rounded-2xl p-3 flex gap-2.5" style={{ background: 'rgba(255,255,255,0.95)' }}>
                <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0" style={{ background: 'var(--green)' }}>
                  <Timer size={15} color="#fff" />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold" style={{ color: '#475569' }}>EOC CREW · now</div>
                  <p className="text-[13px] font-bold" style={{ color: '#0F172A' }}>Standby: {title.trim() || 'Event name'}</p>
                  <p className="text-[12px] leading-snug" style={{ color: '#334155' }}>
                    {[
                      `${vehicle?.registrationNumber ?? 'Ambulance'} to standby`,
                      location.trim() ? `at ${location.trim()}` : null,
                      whenText ? `from ${whenText}` : null,
                      notes.trim() || null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>SENT TO</p>
              {!vehicle ? (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Pick an ambulance to see its crew.</p>
              ) : crew.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--amber)' }}>Nobody is checked in to {vehicle.registrationNumber}, so no one will be notified.</p>
              ) : (
                <ul className="col" style={{ gap: 6 }}>
                  {crew.map((c) => (
                    <li key={c.name} className="flex items-center gap-2 text-sm">
                      <span className="w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold" style={{ background: 'var(--green-light)', color: 'var(--green)' }}>
                        {c.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </span>
                      <span style={{ color: 'var(--ink)' }}>{c.name}</span>
                      <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>{c.role}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-xs mt-auto flex items-start gap-1.5" style={{ color: 'var(--muted)' }}>
              <CalendarClock size={13} className="mt-0.5 shrink-0" /> When you end the standby, the crew is told they're released.
            </p>
          </aside>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="text-xs hidden sm:block" style={{ color: 'var(--muted)' }}>
            {valid ? 'Ready to go.' : 'Pick an ambulance and name the event.'}
          </span>
          <button onClick={onClose} disabled={create.isPending} className="btn btn-ghost ml-auto">Cancel</button>
          <button onClick={() => create.mutate()} disabled={!valid || create.isPending} className="btn btn-primary" style={{ minWidth: 220 }}>
            {create.isPending ? <AppLoader size={18} /> : <BellRing size={16} />}
            {create.isPending ? 'Placing…' : crew.length > 0 ? 'Place on standby & notify crew' : 'Place on standby'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StandbyPage;
