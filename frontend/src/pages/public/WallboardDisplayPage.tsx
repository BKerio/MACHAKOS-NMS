import { useEffect, useState, useCallback } from 'react';
import {
  Headphones as Headset,
  Truck,
  Car as SteeringWheel,
  BriefcaseMedical as FirstAidKit,
  Wifi as WifiHigh,
  WifiOff as WifiSlash,
  MapPin,
  RadioTower as Broadcast,
  CircleAlert as WarningCircle,
} from 'lucide-react';
import { fmtDate, fmtTime } from '@/lib/datetime';

/**
 * Unattended read-only wallboard for a TV in the call centre - no login.
 *
 * Deliberately separate from the authenticated `WallboardPage`:
 *   - Reads one public endpoint (`/public/wallboard`) instead of several
 *     authenticated ones, so it needs no JWT and no socket handshake.
 *   - Polls rather than using sockets - a display that silently stops updating
 *     is worse than useless, and polling recovers from a dropped connection on
 *     its own. The header shows a warning if data goes stale.
 *   - Larger type and no interactive controls, since it's read across a room.
 *
 * Access: /display?token=<WALLBOARD_TOKEN>
 */

const POLL_MS = 10_000;
const TRACKER_STALE_MS = 5 * 60 * 1000;
const DATA_STALE_MS = 45_000; // no successful poll in 45s → warn on screen

interface DisplayVehicle {
  id: string;
  registrationNumber: string;
  status: string | null;
  hasTracker: boolean;
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: string | null;
  lastLocationName: string | null;
  agencyName: string | null;
  driver: string | null;
  emt: string | null;
  nurse: string | null;
}

interface DisplayPayload {
  serverTime: string;
  onDuty: Array<{ name: string; role: string; connectedAt: string }>;
  vehicles: DisplayVehicle[];
}

function timeSince(iso?: string | null): string {
  if (!iso) return '-';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return fmtDate(iso);
}

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ textAlign: 'right' }}>
      <div className="mono tnum" style={{ fontSize: 56, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
        {fmtTime(now)}
      </div>
      <div style={{ fontSize: 16, marginTop: 6, color: 'var(--nav-muted)' }}>
        {fmtDate(now)} · Africa/Nairobi
      </div>
    </div>
  );
}

function Stat({ label, value, Icon }: { label: string; value: number; Icon: any }) {
  return (
    <div style={{ flex: '1 1 190px', background: 'rgba(255,255,255,.05)', border: '1px solid var(--nav-border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#5FD79A' }}>
        <Icon size={20} color="#5FD79A" />
        <span style={{ fontSize: 13, letterSpacing: '.05em', color: 'var(--nav-muted)' }}>{label}</span>
      </div>
      <div className="mono tnum" style={{ fontSize: 40, fontWeight: 700, color: '#fff' }}>{value}</div>
    </div>
  );
}

function WallboardDisplayPage() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [data, setData] = useState<DisplayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/public/wallboard?token=${encodeURIComponent(token)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (res.status === 403) { setError('Display token rejected. Check the ?token= value and WALLBOARD_TOKEN.'); return; }
      if (!res.ok) { setError(`Server returned ${res.status}`); return; }
      const json = await res.json();
      setData(json.data);
      setLastOk(Date.now());
      setError(null);
    } catch {
      setError('Cannot reach the server.');
    }
  }, [token]);

  useEffect(() => {
    if (!token) { setError('No display token. Open this page as /display?token=YOUR_TOKEN'); return; }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll, token]);

  const stale = lastOk !== null && Date.now() - lastOk > DATA_STALE_MS;
  const vehicles = data?.vehicles ?? [];
  const watchers = (data?.onDuty ?? []).filter(u => u.role === 'WATCHER');
  const dispatchers = (data?.onDuty ?? []).filter(u => u.role === 'DISPATCHER');
  const crewed = vehicles.filter(v => v.driver || v.emt || v.nurse);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--nav-bg)', padding: 28, color: '#fff' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Broadcast size={34} color="#5FD79A" />
          <div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>Operations Wallboard</div>
            <div style={{ color: 'var(--nav-muted)', fontSize: 15 }}>Nairobi EOC · live call-centre overview</div>
          </div>
        </div>
        <LiveClock />
      </div>

      {(error || stale) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,170,0,.12)', border: '1px solid rgba(255,170,0,.4)', color: '#FFC65C', borderRadius: 12, padding: '12px 16px', marginBottom: 22, fontSize: 15 }}>
          <WarningCircle size={20} color="#FFC65C" />
          {error ?? `Data may be out of date - last successful update ${timeSince(new Date(lastOk!).toISOString())}.`}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 24 }}>
        <Stat label="Ambulances on duty" value={crewed.length} Icon={Truck} />
        <Stat label="With GPS tracker" value={vehicles.filter(v => v.hasTracker).length} Icon={WifiHigh} />
        <Stat label="Drivers logged in" value={vehicles.filter(v => v.driver).length} Icon={SteeringWheel} />
        <Stat label="EMTs in ambulance" value={vehicles.filter(v => v.emt).length} Icon={FirstAidKit} />
        <Stat label="Nurses in ambulance" value={vehicles.filter(v => v.nurse).length} Icon={FirstAidKit} />
      </div>

      {/* Duty roster */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 24 }}>
        {[
          { title: 'Watcher on Duty', people: watchers },
          { title: 'Dispatcher on Duty', people: dispatchers },
        ].map(({ title, people }) => (
          <div key={title} style={{ flex: '1 1 340px', background: 'rgba(255,255,255,.05)', border: '1px solid var(--nav-border)', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <Headset size={20} color="#5FD79A" />
              <span style={{ fontWeight: 700, fontSize: 17 }}>{title}</span>
              <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--nav-muted)' }}>{people.length} online</span>
            </div>
            {people.length === 0 ? (
              <div style={{ color: 'var(--nav-muted)', fontSize: 15, fontStyle: 'italic' }}>Nobody currently logged in</div>
            ) : people.map(p => (
              <div key={p.name + p.connectedAt} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--nav-border)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 17, fontWeight: 600 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 99, background: '#5FD79A' }} />
                  {p.name}
                </span>
                <span className="mono tnum" style={{ fontSize: 14, color: 'var(--nav-muted)' }}>since {fmtTime(p.connectedAt, false)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Ambulances */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <Truck size={20} color="#5FD79A" />
        <span style={{ fontWeight: 700, fontSize: 17 }}>Ambulances</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
        {vehicles.length === 0 && !error && (
          <div style={{ color: 'var(--nav-muted)', fontSize: 16 }}>No active ambulances.</div>
        )}
        {vehicles.map(v => {
          const live = !!v.lastLocationAt && Date.now() - new Date(v.lastLocationAt).getTime() < TRACKER_STALE_MS;
          const crew = [v.driver && `${v.driver} (driver)`, v.emt && `${v.emt} (EMT)`, v.nurse && `${v.nurse} (nurse)`].filter(Boolean) as string[];
          return (
            <div key={v.id} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--nav-border)', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 19 }}>{v.registrationNumber}</span>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', padding: '3px 10px', borderRadius: 99,
                  background: v.status === 'BUSY' ? 'rgba(255,90,90,.18)' : v.status === 'MAINTENANCE' ? 'rgba(160,160,160,.18)' : 'rgba(95,215,154,.18)',
                  color: v.status === 'BUSY' ? '#FF8080' : v.status === 'MAINTENANCE' ? '#BFBFBF' : '#5FD79A' }}>
                  {v.status ?? 'READY'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, marginBottom: 8, color: live ? '#5FD79A' : 'var(--nav-muted)' }}>
                {v.hasTracker ? (live ? <WifiHigh size={17} /> : <WifiSlash size={17} />) : <WifiSlash size={17} />}
                <span>{!v.hasTracker ? 'No tracker fitted' : live ? 'Live GPS' : 'No recent signal'}</span>
                {v.hasTracker && <span>· {timeSince(v.lastLocationAt)}</span>}
              </div>

              {v.lastLocationName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, marginBottom: 10, color: 'var(--nav-muted)' }}>
                  <MapPin size={15} /> {v.lastLocationName}
                </div>
              )}

              {crew.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {crew.map(c => <div key={c} style={{ fontSize: 14.5, color: '#DCEAE2' }}>{c}</div>)}
                </div>
              ) : (
                <div style={{ fontSize: 14, color: 'var(--nav-muted)', fontStyle: 'italic' }}>No crew checked in</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default WallboardDisplayPage;
