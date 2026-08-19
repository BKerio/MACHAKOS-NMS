import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Headphones as Headset,
  Siren,
  Truck,
  Car as SteeringWheel,
  BriefcaseMedical as FirstAidKit,
  Wifi as WifiHigh,
  WifiOff as WifiSlash,
  MapPin,
  RadioTower as Broadcast,
} from 'lucide-react';
import api from '@/api/client';
import { socket } from '@/lib/socket';
import { Vehicle } from '@/types/api';
import { usePresence } from '@/hooks/usePresence';
import { useVehicleTracking } from '@/hooks/useVehicleTracking';
// Aliased: a bare `Map` import shadows the global Map constructor, which is
// used below to build the vehicle lookup.
import OpsMap from '@/components/shared/Map';
import { fmtDate, fmtTime } from '@/lib/datetime';

const NAIROBI_CENTER: [number, number] = [-1.2921, 36.8219];
const TRACKER_STALE_MS = 5 * 60 * 1000; // no fix in 5 min → treat as "no signal"

/** Big centred clock, ticking every second, pinned to Africa/Nairobi like the rest of the app. */
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="col" style={{ alignItems: 'flex-end' }}>
      <div className="mono tnum" style={{ fontSize: 40, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
        {fmtTime(now)}
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4, color: 'var(--nav-muted)' }}>
        {fmtDate(now)} · Africa/Nairobi
      </div>
    </div>
  );
}

function timeSince(iso?: string | null): string {
  if (!iso) return '-';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return fmtDate(iso);
}

/** One row in a duty-roster card (Watcher / Dispatcher on duty). */
function DutyRow({ name, since }: { name: string; since: string }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--nav-border)' }}>
      <div className="row" style={{ gap: 8 }}>
        <span className="live-dot" style={{ width: 8, height: 8, borderRadius: 99, background: '#5FD79A', display: 'inline-block' }} />
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 13.5 }}>{name}</span>
      </div>
      <span className="mono tnum" style={{ fontSize: 12, color: 'var(--nav-muted)' }}>since {fmtTime(since, false)}</span>
    </div>
  );
}

/** One ambulance card: crew, GPS tracker status, last known location. */
function AmbulanceCard({ vehicle, live }: { vehicle: Vehicle; live?: { timestamp: string } }) {
  const lastFix = live?.timestamp ?? vehicle.lastLocationAt;
  const isLive = !!lastFix && Date.now() - new Date(lastFix).getTime() < TRACKER_STALE_MS;
  const hasCrew = !!(vehicle.currentDriver || vehicle.currentEmt || vehicle.currentNurse);

  const statusPill =
    vehicle.status === 'BUSY' ? 'pill-red' : vehicle.status === 'MAINTENANCE' ? 'pill-gray' : 'pill-green';

  return (
    <div className="card card-pad" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--nav-border)' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <Truck size={18} color="#5FD79A" />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14.5 }}>{vehicle.registrationNumber}</span>
        </div>
        <span className={`pill ${statusPill}`}>{vehicle.status ?? 'READY'}</span>
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 8, color: isLive ? '#5FD79A' : 'var(--nav-muted)', fontSize: 12 }}>
        {isLive ? <WifiHigh size={15} /> : <WifiSlash size={15} />}
        <span>{isLive ? 'Live GPS' : 'No recent signal'}</span>
        <span style={{ color: 'var(--nav-muted)' }}>· {timeSince(lastFix)}</span>
      </div>

      {vehicle.lastLocationName && (
        <div className="row" style={{ gap: 6, marginBottom: 10, color: 'var(--nav-muted)', fontSize: 12 }}>
          <MapPin size={14} />
          <span>{vehicle.lastLocationName}</span>
        </div>
      )}

      {hasCrew ? (
        <div className="col" style={{ gap: 5 }}>
          {vehicle.currentDriver && (
            <div className="row" style={{ gap: 7, fontSize: 12.5, color: '#DCEAE2' }}>
              <SteeringWheel size={14} /> {vehicle.currentDriver.name} <span className="muted">(driver)</span>
            </div>
          )}
          {vehicle.currentEmt && (
            <div className="row" style={{ gap: 7, fontSize: 12.5, color: '#DCEAE2' }}>
              <FirstAidKit size={14} /> {vehicle.currentEmt.name} <span className="muted">(EMT)</span>
            </div>
          )}
          {vehicle.currentNurse && (
            <div className="row" style={{ gap: 7, fontSize: 12.5, color: '#DCEAE2' }}>
              <FirstAidKit size={14} /> {vehicle.currentNurse.name} <span className="muted">(nurse)</span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--nav-muted)', fontStyle: 'italic' }}>No crew checked in</div>
      )}
    </div>
  );
}

function WallboardPage() {
  const queryClient = useQueryClient();

  // All active vehicles + crew - the source of truth for "ambulances / drivers / EMTs on duty".
  const { data: vehicles = [] } = useQuery({
    queryKey: ['dispatch', 'vehicles', 'wallboard'],
    queryFn: async () => {
      const res = await api.get('/dispatch/vehicles');
      return (res.data.data ?? res.data) as Vehicle[];
    },
    refetchInterval: 15_000,
  });

  // Live GPS positions for the map panel + "last fix" freshness on each card.
  const { vehicles: liveVehicles, lastUpdatedAt } = useVehicleTracking();
  const liveById = new Map(liveVehicles.map((v) => [v.vehicleId, v]));

  const { byRole } = usePresence();
  const watchers = byRole('WATCHER');
  const dispatchers = byRole('DISPATCHER');

  useEffect(() => {
    socket.connect();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['dispatch', 'vehicles', 'wallboard'] });
    socket.on('vehicle:crew', refresh);
    return () => { socket.off('vehicle:crew', refresh); };
  }, [queryClient]);

  const activeVehicles = vehicles.filter((v) => v.isActive);
  const onDuty = activeVehicles.filter((v) => v.currentDriver || v.currentEmt || v.currentNurse);
  const driversOnDuty = activeVehicles.filter((v) => v.currentDriver);
  const emtsOnDuty = activeVehicles.filter((v) => v.currentEmt);
  const nursesOnDuty = activeVehicles.filter((v) => v.currentNurse);
  const withTrackers = activeVehicles.filter((v) => !!v.imei);

  return (
    <div style={{ margin: '-24px', minHeight: '100vh', background: 'var(--nav-bg)', padding: 24 }}>
      {/* Header: title + live clock */}
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 16 }}>
        <div className="row" style={{ gap: 12 }}>
          <Broadcast size={26} color="#5FD79A" />
          <div>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>Operations Wallboard</div>
            <div style={{ color: 'var(--nav-muted)', fontSize: 12.5 }}>Live call-centre overview · Nairobi EOC</div>
          </div>
        </div>
        <LiveClock />
      </div>

      {/* Top stat strip */}
      <div className="wrap-gap" style={{ marginBottom: 22 }}>
        {[
          { label: 'Ambulances on duty', value: onDuty.length, sub: `of ${activeVehicles.length} active`, Icon: Siren },
          { label: 'With GPS tracker', value: withTrackers.length, sub: 'reporting position', Icon: WifiHigh },
          { label: 'Drivers logged in', value: driversOnDuty.length, sub: 'checked in', Icon: SteeringWheel },
          { label: 'EMTs in ambulance', value: emtsOnDuty.length, sub: 'checked in', Icon: FirstAidKit },
          { label: 'Nurses in ambulance', value: nursesOnDuty.length, sub: 'checked in', Icon: FirstAidKit },
        ].map(({ label, value, sub, Icon }) => (
          <div key={label} className="card card-pad" style={{ flex: '1 1 170px', background: 'rgba(255,255,255,.04)', border: '1px solid var(--nav-border)' }}>
            <div className="row" style={{ gap: 8, marginBottom: 8, color: '#5FD79A' }}>
              <Icon size={17} color="#5FD79A" />
              <span style={{ fontSize: 11.5, letterSpacing: '.05em', color: 'var(--nav-muted)' }}>{label}</span>
            </div>
            <div className="mono tnum" style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{value}</div>
            <div style={{ fontSize: 11.5, color: 'var(--nav-muted)' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Duty roster: Watcher + Dispatcher on duty */}
      <div className="wrap-gap" style={{ marginBottom: 22, alignItems: 'stretch' }}>
        <div className="card card-pad" style={{ flex: '1 1 320px', background: 'rgba(255,255,255,.04)', border: '1px solid var(--nav-border)' }}>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <Headset size={17} color="#5FD79A" />
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Watcher on Duty</span>
            <span className="pill pill-green" style={{ marginLeft: 'auto' }}>{watchers.length} online</span>
          </div>
          {watchers.length === 0
            ? <div style={{ color: 'var(--nav-muted)', fontSize: 12.5, fontStyle: 'italic' }}>No watcher currently logged in</div>
            : watchers.map((w) => <DutyRow key={w.userId} name={w.name} since={w.connectedAt} />)}
        </div>

        <div className="card card-pad" style={{ flex: '1 1 320px', background: 'rgba(255,255,255,.04)', border: '1px solid var(--nav-border)' }}>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <Headset size={17} color="#5FD79A" />
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Dispatcher on Duty</span>
            <span className="pill pill-green" style={{ marginLeft: 'auto' }}>{dispatchers.length} online</span>
          </div>
          {dispatchers.length === 0
            ? <div style={{ color: 'var(--nav-muted)', fontSize: 12.5, fontStyle: 'italic' }}>No dispatcher currently logged in</div>
            : dispatchers.map((d) => <DutyRow key={d.userId} name={d.name} since={d.connectedAt} />)}
        </div>
      </div>

      {/* Live fleet map */}
      <div className="card" style={{ height: 340, marginBottom: 22, overflow: 'hidden', border: '1px solid var(--nav-border)' }}>
        <OpsMap
          center={NAIROBI_CENTER}
          zoom={12}
          vehicleMarkers={liveVehicles}
          layerType="dark"
          showLiveBadge
          showLegend
          lastUpdatedAt={lastUpdatedAt}
        />
      </div>

      {/* Ambulance roster grid */}
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <Truck size={17} color="#5FD79A" />
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Ambulances on Duty</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {activeVehicles.length === 0 && (
          <div style={{ color: 'var(--nav-muted)', fontSize: 13 }}>No active ambulances configured.</div>
        )}
        {activeVehicles.map((v) => (
          <AmbulanceCard key={v.id} vehicle={v} live={liveById.get(v.id)} />
        ))}
      </div>
    </div>
  );
}

export default WallboardPage;
