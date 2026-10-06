import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Headphones,
  Siren,
  PhoneCall,
  Inbox,
  Car,
  BriefcaseMedical,
  Wifi,
  WifiOff,
  MapPin,
  RadioTower,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import api from '@/api/client';
import { socket } from '@/lib/socket';
import { Vehicle } from '@/types/api';
import { usePresence, type PresenceUser } from '@/hooks/usePresence';
import { useVehicleTracking } from '@/hooks/useVehicleTracking';
import { useActiveCalls } from '@/hooks/useActiveCalls';
import { useIncidentQueueCount } from '@/hooks/useIncidentQueueCount';
// Aliased: a bare `Map` import shadows the global Map constructor used below.
import OpsMap from '@/components/shared/Map';
import { fmtDate, fmtTime } from '@/lib/datetime';
import { useTheme } from '@/lib/theme';
import { MIN_MEDICS, vehicleMedics } from '@/utils/crew';

/**
 * Operations wallboard - built for the screen on the ops-room wall: one
 * viewport, readable from across the room, in the user's light or dark theme.
 * Header (title, link state, clock), a strip of headline numbers, the live map
 * beside who's on duty and how the fleet stands, then every ambulance as a
 * colour-coded tile.
 */

const MACHAKOS_CENTER: [number, number] = [-1.5177, 37.2634];
const TRACKER_STALE_MS = 5 * 60 * 1000; // no fix in 5 min -> "no signal"

// Theme-aware palette: the --wb-* variables in index.css switch with data-theme.
const C = {
  bg: 'var(--wb-bg)',
  panel: 'var(--wb-panel)',
  shadow: 'var(--wb-panel-shadow)',
  line: 'var(--wb-line)',
  ink: 'var(--wb-ink)',
  soft: 'var(--wb-soft)',
  muted: 'var(--wb-muted)',
  chip: 'var(--wb-chip)',
  track: 'var(--wb-track)',
  onAlert: 'var(--wb-on-alert)',
  green: 'var(--wb-green)',
  amber: 'var(--wb-amber)',
  red: 'var(--wb-red)',
  blue: 'var(--wb-blue)',
  grey: 'var(--wb-grey)',
  offduty: 'var(--wb-offduty)',
};

type UnitState = 'ready' | 'crewing' | 'engaged' | 'service' | 'offduty';

const STATE: Record<UnitState, { label: string; color: string }> = {
  engaged: { label: 'On a case', color: C.red },
  ready: { label: 'Ready', color: C.green },
  crewing: { label: 'Crewing up', color: C.amber },
  service: { label: 'Out of service', color: C.grey },
  offduty: { label: 'No crew', color: C.offduty },
};

function unitState(v: Vehicle): UnitState {
  if (v.status === 'BUSY') return 'engaged';
  if (v.status === 'MAINTENANCE') return 'service';
  if (!v.currentDriver) return 'offduty';
  return vehicleMedics(v).length >= MIN_MEDICS ? 'ready' : 'crewing';
}

const STATE_ORDER: UnitState[] = ['engaged', 'ready', 'crewing', 'service', 'offduty'];

function ago(iso?: string | null): string {
  if (!iso) return 'never';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ${mins % 60}m ago` : fmtDate(iso);
}

/** Re-renders every second so the clock (and "x min ago" text) stays current. */
function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function useSocketConnected() {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => { socket.off('connect', on); socket.off('disconnect', off); };
  }, []);
  return connected;
}

function Panel({ title, Icon, right, children, className, style }: {
  title: string; Icon: LucideIcon; right?: ReactNode; children: ReactNode; className?: string; style?: React.CSSProperties;
}) {
  return (
    <section
      className={`rounded-2xl flex flex-col min-h-0 ${className ?? ''}`}
      style={{ background: C.panel, border: `1px solid ${C.line}`, boxShadow: C.shadow, ...style }}
    >
      <header className="flex items-center gap-2 px-4 pt-3.5 pb-3" style={{ borderBottom: `1px solid ${C.line}` }}>
        <Icon size={15} color={C.muted} />
        <h2 className="text-[11.5px] font-bold tracking-[0.12em]" style={{ color: C.muted }}>{title.toUpperCase()}</h2>
        <div className="ml-auto">{right}</div>
      </header>
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  );
}

/** One headline number. `alert` lights it up when it needs attention. */
function Stat({ label, value, sub, Icon, alert }: { label: string; value: number; sub: string; Icon: LucideIcon; alert?: string }) {
  const hot = !!alert && value > 0;
  return (
    <div
      className="rounded-2xl px-4 py-3.5 flex items-center gap-3.5 min-w-0"
      style={{
        background: hot ? `color-mix(in srgb, ${alert} 14%, ${C.panel})` : C.panel,
        border: `1px solid ${hot ? `color-mix(in srgb, ${alert} 45%, transparent)` : C.line}`,
        boxShadow: C.shadow,
      }}
    >
      <span
        className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
        style={{ background: hot ? alert : C.chip }}
      >
        <Icon size={19} color={hot ? C.onAlert : C.soft} />
      </span>
      <div className="min-w-0">
        <div className="mono tnum text-[30px] leading-none font-bold" style={{ color: hot ? alert : C.ink }}>{value}</div>
        <div className="text-[12px] font-semibold mt-1 truncate" style={{ color: C.soft }}>{label}</div>
        <div className="text-[11px] truncate" style={{ color: C.muted }}>{sub}</div>
      </div>
    </div>
  );
}

function DutyList({ people, empty }: { people: PresenceUser[]; empty: string }) {
  if (people.length === 0) {
    return <p className="text-[13px] py-2" style={{ color: C.red }}>{empty}</p>;
  }
  return (
    <ul className="flex flex-col">
      {people.map((p) => (
        <li key={p.userId} className="flex items-center gap-2.5 py-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: C.green, boxShadow: `0 0 0 3px color-mix(in srgb, ${C.green} 22%, transparent)` }} />
          <span className="text-[14px] font-semibold truncate" style={{ color: C.ink }}>{p.name}</span>
          <span className="ml-auto mono tnum text-[12px] shrink-0" style={{ color: C.muted }}>since {fmtTime(p.connectedAt, false)}</span>
        </li>
      ))}
    </ul>
  );
}

function UnitTile({ vehicle, lastFix }: { vehicle: Vehicle; lastFix?: string | null }) {
  const state = unitState(vehicle);
  const { label, color } = STATE[state];
  const live = !!lastFix && Date.now() - new Date(lastFix).getTime() < TRACKER_STALE_MS;
  const medics = vehicleMedics(vehicle);

  return (
    <article
      className="rounded-xl overflow-hidden flex flex-col"
      style={{ background: C.panel, border: `1px solid ${C.line}`, borderTop: `3px solid ${color}`, boxShadow: C.shadow }}
    >
      <div className="px-3.5 pt-3 pb-2.5 flex items-center gap-2">
        <span
          className="text-[13px] font-black tracking-wider px-2 py-0.5 rounded"
          style={{ background: '#F7D23E', color: '#111', border: '1.5px solid #111' }}
        >
          {vehicle.registrationNumber.toUpperCase()}
        </span>
        <span className="ml-auto text-[11px] font-bold" style={{ color }}>{label}</span>
      </div>

      <div className="px-3.5 pb-3 flex flex-col gap-1.5 text-[12.5px]">
        {vehicle.currentDriver ? (
          <div className="flex items-center gap-2 min-w-0" style={{ color: C.soft }}>
            <Car size={13} color={C.muted} className="shrink-0" />
            <span className="truncate">{vehicle.currentDriver.name}</span>
          </div>
        ) : (
          <div style={{ color: C.muted }}>No driver checked in</div>
        )}
        {medics.length > 0 && (
          <div className="flex items-center gap-2 min-w-0" style={{ color: C.soft }}>
            <BriefcaseMedical size={13} color={C.muted} className="shrink-0" />
            <span className="truncate">{medics.map((m) => m.person.name.split(' ')[0]).join(', ')}</span>
          </div>
        )}
        {vehicle.currentDriver && (
          <div className="flex items-center gap-1.5" aria-label={`${medics.length} of ${MIN_MEDICS} medics`}>
            {Array.from({ length: MIN_MEDICS }, (_, i) => (
              <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < medics.length ? C.green : C.track }} />
            ))}
            <span className="mono text-[11px] ml-1" style={{ color: medics.length >= MIN_MEDICS ? C.green : C.amber }}>
              {medics.length}/{MIN_MEDICS}
            </span>
          </div>
        )}
      </div>

      <div
        className="mt-auto px-3.5 py-2 flex items-center gap-1.5 text-[11.5px] min-w-0"
        style={{ borderTop: `1px solid ${C.line}`, color: C.muted }}
      >
        {live ? <Wifi size={12} color={C.green} /> : <WifiOff size={12} />}
        <span style={{ color: live ? C.green : C.muted }}>{live ? 'Live' : 'No signal'}</span>
        <span>· {ago(lastFix)}</span>
        {vehicle.lastLocationName && (
          <span className="flex items-center gap-1 ml-auto min-w-0 truncate" title={vehicle.lastLocationName}>
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{vehicle.lastLocationName}</span>
          </span>
        )}
      </div>
    </article>
  );
}

function WallboardPage() {
  const queryClient = useQueryClient();
  const now = useNow();
  const connected = useSocketConnected();
  const theme = useTheme().resolved;

  const { data: vehicles = [] } = useQuery({
    queryKey: ['dispatch', 'vehicles', 'wallboard'],
    queryFn: async () => {
      const res = await api.get('/dispatch/vehicles');
      return (res.data.data ?? res.data) as Vehicle[];
    },
    refetchInterval: 15_000,
  });

  const { vehicles: liveVehicles, lastUpdatedAt } = useVehicleTracking();
  const liveById = new Map(liveVehicles.map((v) => [v.vehicleId, v]));

  const { byRole } = usePresence();
  const watchers = byRole('WATCHER');
  const dispatchers = byRole('DISPATCHER');
  const waiting = useIncidentQueueCount();
  const activeCalls = useActiveCalls();

  useEffect(() => {
    socket.connect();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['dispatch', 'vehicles', 'wallboard'] });
    socket.on('vehicle:crew', refresh);
    return () => { socket.off('vehicle:crew', refresh); };
  }, [queryClient]);

  const active = vehicles.filter((v) => v.isActive);
  const byState = (s: UnitState) => active.filter((v) => unitState(v) === s);
  const sorted = [...active].sort(
    (a, b) => STATE_ORDER.indexOf(unitState(a)) - STATE_ORDER.indexOf(unitState(b))
      || a.registrationNumber.localeCompare(b.registrationNumber),
  );
  const crewOnDuty =
    active.filter((v) => v.currentDriver).length + active.reduce((n, v) => n + vehicleMedics(v).length, 0);
  const tracking = active.filter((v) => {
    const fix = liveById.get(v.id)?.timestamp ?? v.lastLocationAt;
    return !!fix && Date.now() - new Date(fix).getTime() < TRACKER_STALE_MS;
  }).length;

  return (
    <div className="wallboard-page flex flex-col gap-4 p-4 sm:p-6" style={{ background: C.bg }}>
      {/* Header */}
      <header className="flex items-center gap-4 flex-wrap">
        <span className="w-11 h-11 rounded-xl grid place-items-center" style={{ background: C.chip }}>
          <RadioTower size={22} color={C.green} />
        </span>
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight" style={{ color: C.ink }}>Operations Wallboard</h1>
          <p className="text-[12.5px]" style={{ color: C.muted }}>Machakos County Emergency Operations Centre</p>
        </div>
        <span
          className="ml-2 inline-flex items-center gap-2 text-[11.5px] font-bold tracking-[0.1em] px-3 py-1.5 rounded-full"
          style={{
            color: connected ? C.green : C.amber,
            background: `color-mix(in srgb, ${connected ? C.green : C.amber} 12%, transparent)`,
          }}
        >
          <span className={`w-2 h-2 rounded-full ${connected ? 'live-dot' : ''}`} style={{ background: connected ? C.green : C.amber }} />
          {connected ? 'LIVE' : 'RECONNECTING'}
        </span>
        <div className="ml-auto text-right">
          <div className="mono tnum text-[44px] font-bold leading-none" style={{ color: C.ink }}>{fmtTime(now)}</div>
          <div className="text-[12.5px] mt-1" style={{ color: C.muted }}>{fmtDate(now)} · Africa/Nairobi</div>
        </div>
      </header>

      {/* Headline numbers */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 min-[1600px]:grid-cols-6">
        <Stat label="Waiting for dispatch" value={waiting} sub="cases in the queue" Icon={Inbox} alert={C.red} />
        <Stat label="Calls in progress" value={activeCalls.length} sub="on the phone lines" Icon={PhoneCall} alert={C.amber} />
        <Stat label="On a case" value={byState('engaged').length} sub={`of ${active.length} ambulances`} Icon={Siren} />
        <Stat label="Ready to dispatch" value={byState('ready').length} sub="full crew checked in" Icon={Car} />
        <Stat label="Crew on duty" value={crewOnDuty} sub="drivers, EMTs & nurses" Icon={BriefcaseMedical} />
        <Stat label="Out of service" value={byState('service').length} sub="awaiting repair" Icon={Wrench} alert={C.grey} />
      </div>

      {/* Map + duty / fleet status */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel
          title="Live fleet map"
          Icon={MapPin}
          right={<span className="text-[11.5px]" style={{ color: C.muted }}>{tracking} of {active.length} reporting GPS</span>}
          style={{ minHeight: 420 }}
        >
          <div className="h-full min-h-[380px] rounded-b-2xl overflow-hidden">
            {/* Keyed on theme: the map picks its colour scheme when it is created. */}
            <OpsMap
              key={theme}
              center={MACHAKOS_CENTER}
              zoom={11}
              vehicleMarkers={liveVehicles}
              layerType={theme}
              showLiveBadge
              showLegend
              lastUpdatedAt={lastUpdatedAt}
              className="h-full w-full"
            />
          </div>
        </Panel>

        <div className="flex flex-col gap-4 min-h-0">
          <Panel title="On duty" Icon={Headphones}>
            <div className="px-4 py-3 flex flex-col gap-3">
              <div>
                <p className="text-[11px] font-bold tracking-[0.1em] mb-1" style={{ color: C.muted }}>
                  DISPATCHERS · {dispatchers.length}
                </p>
                <DutyList people={dispatchers} empty="No dispatcher logged in" />
              </div>
              <div style={{ borderTop: `1px solid ${C.line}` }} className="pt-3">
                <p className="text-[11px] font-bold tracking-[0.1em] mb-1" style={{ color: C.muted }}>
                  WATCHERS · {watchers.length}
                </p>
                <DutyList people={watchers} empty="No watcher logged in" />
              </div>
            </div>
          </Panel>

          <Panel title="Fleet status" Icon={Siren}>
            <div className="px-4 py-3 flex flex-col gap-2.5">
              {/* Stacked bar: the whole fleet at a glance */}
              <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: C.track }}>
                {STATE_ORDER.map((s) => {
                  const n = byState(s).length;
                  return n > 0 ? <span key={s} style={{ width: `${(n / Math.max(active.length, 1)) * 100}%`, background: STATE[s].color }} /> : null;
                })}
              </div>
              {STATE_ORDER.map((s) => (
                <div key={s} className="flex items-center gap-2.5 text-[13.5px]">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: STATE[s].color }} />
                  <span style={{ color: C.soft }}>{STATE[s].label}</span>
                  <span className="ml-auto mono tnum font-bold" style={{ color: C.ink }}>{byState(s).length}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {/* Every ambulance */}
      <Panel
        title="Ambulances"
        Icon={Car}
        right={<span className="text-[11.5px]" style={{ color: C.muted }}>{active.length} active · on a case first</span>}
      >
        <div className="p-4">
          {sorted.length === 0 ? (
            <p className="text-[13px]" style={{ color: C.muted }}>No active ambulances configured.</p>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
              {sorted.map((v) => (
                <UnitTile key={v.id} vehicle={v} lastFix={liveById.get(v.id)?.timestamp ?? v.lastLocationAt} />
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

export default WallboardPage;
