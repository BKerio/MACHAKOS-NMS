import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Fuel as GasPump,
  Calendar as CalendarBlank,
  ArrowRight,
  CircleAlert as WarningCircle,
  RefreshCw as ArrowsClockwise,
  TrendingDown as TrendDown,
  TrendingUp as TrendUp,
  MapPin,
  X,
} from 'lucide-react';
import api from '@/api/client';

interface FuelSummaryRow {
  imei: string;
  vehicleId: string | null;
  registrationNumber: string;
  hasSensor: boolean;
  sensorModel: string | null;
  distanceKm: number;
  fuelConsumedL: number;
  mileageKmPerL: number;
  startFuelL: number;
  endFuelL: number;
  filledL: number;
  drainedL: number;
  fillCount: number;
  drainCount: number;
  runningTime: string | null;
  idleTime: string | null;
  stopTime: string | null;
}

interface FuelMeta {
  cached: boolean;
  fetchedAt: string | null;
  stale: boolean;
  retryAfter: string | null;
}

interface FuelEvent {
  type: string;
  startDateTime: string | null;
  endDateTime: string | null;
  beforeLevelL: number;
  afterLevelL: number;
  changeL: number;
  odometer: number | null;
  location: string | null;
  driver: string | null;
  distanceKm: number;
  mileageKmPerL: number;
  fuelConsumedL: number;
}

function nairobiToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

const n1 = (v: number) => v.toFixed(1);

function FuelPage() {
  const today = nairobiToday();
  const [from, setFrom] = useState(shiftDays(today, -29));
  const [to, setTo] = useState(today);
  const [openVehicle, setOpenVehicle] = useState<FuelSummaryRow | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['fuel', 'summary', from, to],
    queryFn: async () => {
      const res = await api.get('/fuel/summary', { params: { from, to } });
      return { rows: res.data.data as FuelSummaryRow[], meta: res.data.meta as FuelMeta };
    },
    retry: false,
    // Uffizio throttles this API to ~15 minutes, so refetching on focus or
    // remount would only ever hit the cooldown.
    refetchOnWindowFocus: false,
    staleTime: 15 * 60_000,
  });
  const rows = data?.rows ?? [];
  const meta = data?.meta;

  // Countdown to when Uffizio will accept another call.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const retryMs = meta?.retryAfter ? new Date(meta.retryAfter).getTime() - now : 0;
  const coolingDown = retryMs > 0;
  const countdown = coolingDown
    ? `${String(Math.floor(retryMs / 60000)).padStart(2, '0')}:${String(Math.floor((retryMs % 60000) / 1000)).padStart(2, '0')}`
    : null;

  const { data: events = [], isLoading: eventsLoading, error: eventsError } = useQuery({
    queryKey: ['fuel', 'events', openVehicle?.vehicleId, from, to],
    enabled: !!openVehicle?.vehicleId,
    queryFn: async () => {
      const res = await api.get(`/fuel/events/${openVehicle!.vehicleId}`, { params: { from, to } });
      return res.data.data as FuelEvent[];
    },
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 15 * 60_000,
  });

  const withSensor = rows.filter(r => r.hasSensor);
  const totals = withSensor.reduce(
    (a, r) => ({
      consumed: a.consumed + r.fuelConsumedL,
      filled: a.filled + r.filledL,
      drained: a.drained + r.drainedL,
      distance: a.distance + r.distanceKm,
      drains: a.drains + r.drainCount,
    }),
    { consumed: 0, filled: 0, drained: 0, distance: 0, drains: 0 },
  );
  const fleetMileage = totals.consumed > 0 ? totals.distance / totals.consumed : 0;
  const apiMessage = (error as any)?.response?.data?.message ?? (error as any)?.message;

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <GasPump size={24} className="text-brand-green" />
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Fuel Monitoring</h1>
            <p className="muted" style={{ fontSize: 13 }}>Consumption, refuelling and drain events from the fuel sensors</p>
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => refetch()}
          disabled={isFetching || coolingDown}
          title={coolingDown ? 'Uffizio limits fuel reports to one call every ~15 minutes' : undefined}
        >
          <ArrowsClockwise size={15} />
          {isFetching ? 'Refreshing…' : coolingDown ? `Refresh in ${countdown}` : 'Refresh'}
        </button>
      </div>

      {/* Date range */}
      <div className="card card-pad row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <CalendarBlank size={16} className="muted" />
        <input type="date" className="input" style={{ height: 34, width: 150, padding: '0 10px', fontSize: 13 }}
          value={from} max={to} onChange={e => setFrom(e.target.value)} />
        <ArrowRight size={13} className="muted" />
        <input type="date" className="input" style={{ height: 34, width: 150, padding: '0 10px', fontSize: 13 }}
          value={to} min={from} max={today} onChange={e => setTo(e.target.value)} />
        <div className="row" style={{ gap: 6, marginLeft: 8 }}>
          {[
            { label: 'Last 7 days', d: -6 },
            { label: 'Last 30 days', d: -29 },
            { label: 'Last 90 days', d: -89 },
          ].map(p => (
            <button key={p.label} className="btn btn-ghost btn-sm"
              onClick={() => { setFrom(shiftDays(today, p.d)); setTo(today); }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="card card-pad row" style={{ gap: 10, alignItems: 'flex-start', borderColor: '#F5B14C' }}>
          <WarningCircle size={18} color="#B7791F" />
          <div style={{ fontSize: 13 }}>
            <strong>Could not load fuel data.</strong>
            <div className="muted" style={{ marginTop: 4 }}>{String(apiMessage ?? 'Unknown error')}</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Uffizio rate-limits to roughly one call a minute and the GPS poller runs every 65s -
              if this mentions a call limit, wait a moment and hit Refresh.
            </div>
          </div>
        </div>
      )}

      {/* Data freshness - this API is heavily throttled, so always say how old
          the figures are rather than implying they're live. */}
      {meta?.fetchedAt && (
        <div className="row muted" style={{ gap: 8, fontSize: 12.5, flexWrap: 'wrap' }}>
          <span>
            Figures retrieved {new Date(meta.fetchedAt).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' })}
            {meta.cached ? ' (cached)' : ''}
          </span>
          {meta.stale && <span style={{ color: '#B7791F', fontWeight: 600 }}>· may be out of date</span>}
          {coolingDown && <span>· next refresh available in {countdown}</span>}
        </div>
      )}

      {/* Totals */}
      {!error && (
        <div className="wrap-gap">
          {[
            { label: 'Fuel consumed', value: `${n1(totals.consumed)} L` },
            { label: 'Fuel filled', value: `${n1(totals.filled)} L` },
            { label: 'Distance', value: `${n1(totals.distance)} km` },
            { label: 'Fleet average', value: fleetMileage ? `${n1(fleetMileage)} km/L` : '-' },
            { label: 'Drain events', value: String(totals.drains), alert: totals.drains > 0 },
          ].map(s => (
            <div key={s.label} className="card card-pad" style={{ flex: '1 1 170px' }}>
              <div className="muted" style={{ fontSize: 11, letterSpacing: '.05em', marginBottom: 6 }}>{s.label}</div>
              <div className="mono tnum" style={{ fontSize: 24, fontWeight: 700, color: s.alert ? '#C53030' : undefined }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="tbl" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Vehicle</th><th>Distance</th><th>Consumed</th><th>km/L</th>
              <th>Filled</th><th>Drained</th><th>Tank start → end</th><th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center' }} className="muted">Loading fuel data…</td></tr>}
            {!isLoading && rows.length === 0 && !error && (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center' }} className="muted">
                No fuel data returned for this period.
              </td></tr>
            )}
            {rows.map(r => (
              <tr key={r.imei || r.registrationNumber}>
                <td style={{ fontWeight: 600 }}>
                  {r.registrationNumber}
                  {!r.hasSensor && (
                    <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>No fuel sensor fitted</div>
                  )}
                </td>
                {r.hasSensor ? (
                  <>
                    <td className="tnum">{n1(r.distanceKm)} km</td>
                    <td className="tnum">{n1(r.fuelConsumedL)} L</td>
                    <td className="tnum">{r.mileageKmPerL ? n1(r.mileageKmPerL) : '-'}</td>
                    <td className="tnum">
                      {r.filledL > 0 ? <span style={{ color: '#2F855A' }}>+{n1(r.filledL)} L</span> : '-'}
                      {r.fillCount > 0 && <span className="muted" style={{ fontSize: 11 }}> ({r.fillCount})</span>}
                    </td>
                    <td className="tnum">
                      {r.drainedL > 0
                        ? <span style={{ color: '#C53030', fontWeight: 700 }}>−{n1(r.drainedL)} L</span>
                        : '-'}
                      {r.drainCount > 0 && <span className="muted" style={{ fontSize: 11 }}> ({r.drainCount})</span>}
                    </td>
                    <td className="tnum muted">{n1(r.startFuelL)} → {n1(r.endFuelL)} L</td>
                    <td>
                      {r.vehicleId && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setOpenVehicle(r)}>Events</button>
                      )}
                    </td>
                  </>
                ) : (
                  <td colSpan={7} className="muted" style={{ fontSize: 12 }}>
                    Fuel telemetry unavailable - this tracker has no fuel probe.
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Events drawer */}
      {openVehicle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}
             onClick={() => setOpenVehicle(null)}>
          <div className="card" style={{ width: 'min(560px, 100%)', height: '100%', borderRadius: 0, overflowY: 'auto', padding: 20 }}
               onClick={e => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{openVehicle.registrationNumber} - fuel events</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpenVehicle(null)}><X size={16} /></button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>{from} → {to}</p>

            {eventsLoading && <p className="muted" style={{ fontSize: 13 }}>Loading events…</p>}
            {eventsError != null && (
              <p style={{ fontSize: 13, color: '#C53030' }}>
                {String((eventsError as any)?.response?.data?.message ?? 'Could not load events.')}
              </p>
            )}
            {!eventsLoading && !eventsError && events.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>No fill or drain events recorded in this period.</p>
            )}

            <div className="col" style={{ gap: 10 }}>
              {events.map((ev, i) => {
                const isDrain = ev.changeL < 0;
                return (
                  <div key={i} className="card card-pad" style={{ borderLeft: `3px solid ${isDrain ? '#C53030' : '#2F855A'}` }}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="row" style={{ gap: 6, fontWeight: 700, fontSize: 14, color: isDrain ? '#C53030' : '#2F855A' }}>
                        {isDrain ? <TrendDown size={16} /> : <TrendUp size={16} />}
                        {isDrain ? 'Drain' : 'Fill'} {n1(Math.abs(ev.changeL))} L
                      </span>
                      <span className="muted mono" style={{ fontSize: 12 }}>{ev.startDateTime ?? '-'}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      Tank {n1(ev.beforeLevelL)} L → {n1(ev.afterLevelL)} L
                      {ev.odometer != null && ` · odometer ${n1(ev.odometer)} km`}
                    </div>
                    {ev.location && (
                      <div className="row muted" style={{ gap: 5, fontSize: 12.5, marginTop: 4 }}>
                        <MapPin size={13} /> {ev.location}
                      </div>
                    )}
                    {ev.driver && <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Driver: {ev.driver}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FuelPage;
