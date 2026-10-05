import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Route, Clock, Trophy } from 'lucide-react';
import api from '@/api/client';
import LoadingState from '@/components/shared/LoadingState';

/**
 * Km each ambulance drove in every hour of one day, with totals - from our own
 * 65-second GPS poll (GET /fuel/distance), so it's always available, unlike
 * the throttled Uffizio fuel report below it.
 */

interface DistanceDay {
  date: string;
  vehicles: { vehicleId: string; registrationNumber: string; hours: number[]; totalKm: number }[];
  hourTotals: number[];
  totalKm: number;
  source: 'GPS' | 'ODOMETER' | 'MIXED' | null;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function nairobiToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
}
function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00+03:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(d);
}
function nairobiHourNow(): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
}
const km = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(1));
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

function HourlyDistanceCard() {
  const today = nairobiToday();
  const [date, setDate] = useState(today);
  const isToday = date === today;
  const hourNow = nairobiHourNow();

  const { data, isLoading, error } = useQuery({
    queryKey: ['fuel', 'distance', date],
    queryFn: async () => (await api.get('/fuel/distance', { params: { date } })).data.data as DistanceDay,
    refetchInterval: isToday ? 65_000 : false,
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const peak = data.hourTotals.reduce((best, v, h) => (v > data.hourTotals[best] ? h : best), 0);
    const top = data.vehicles[0];
    const cellMax = Math.max(0.1, ...data.vehicles.flatMap((v) => v.hours));
    const barMax = Math.max(0.1, ...data.hourTotals);
    const moving = data.vehicles.filter((v) => v.totalKm > 0).length;
    return { peak, top, cellMax, barMax, moving };
  }, [data]);

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Head */}
      <div className="card-pad row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid var(--border)' }}>
        <span className="row" style={{ gap: 8, fontWeight: 700, fontSize: 14 }}>
          <Route size={15} className="text-brand-green" /> Distance by hour
          {isToday && <span className="live-badge" style={{ marginLeft: 4 }}><span className="dot live-dot" /> Live</span>}
        </span>
        <div className="row" style={{ gap: 6 }}>
          <button className="icon-btn" onClick={() => setDate((d) => shiftDay(d, -1))} aria-label="Previous day"><ChevronLeft size={16} /></button>
          <input type="date" className="input" style={{ width: 160, height: 34 }} value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button className="icon-btn" onClick={() => setDate((d) => shiftDay(d, 1))} disabled={isToday} aria-label="Next day"><ChevronRight size={16} /></button>
          {!isToday && <button className="btn btn-ghost btn-sm" onClick={() => setDate(today)}>Today</button>}
        </div>
      </div>

      {isLoading ? (
        <LoadingState minHeight={220} label="Loading distance…" />
      ) : error || !data || !stats ? (
        <p className="card-pad" style={{ color: 'var(--red)', fontSize: 13 }}>Couldn't load distance for this day.</p>
      ) : (
        <>
          {/* Headline numbers */}
          <div className="card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, paddingBottom: 8 }}>
            {[
              { Icon: Route, label: isToday ? 'Driven so far today' : 'Driven this day', value: `${km(data.totalKm)} km`, sub: `${stats.moving} of ${data.vehicles.length} ambulances moved` },
              { Icon: Clock, label: 'Busiest hour', value: data.totalKm > 0 ? `${hh(stats.peak)}–${hh((stats.peak + 1) % 24)}` : '—', sub: data.totalKm > 0 ? `${km(data.hourTotals[stats.peak])} km fleet-wide` : 'no movement yet' },
              { Icon: Trophy, label: 'Most driven', value: stats.top && stats.top.totalKm > 0 ? stats.top.registrationNumber : '—', sub: stats.top && stats.top.totalKm > 0 ? `${km(stats.top.totalKm)} km` : 'no movement yet' },
            ].map(({ Icon, label, value, sub }) => (
              <div key={label} className="row" style={{ gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <Icon size={16} className="muted" />
                <div style={{ minWidth: 0 }}>
                  <div className="muted" style={{ fontSize: 11.5 }}>{label}</div>
                  <div className="mono tnum" style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Fleet km per hour */}
          <div className="card-pad" style={{ paddingTop: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 3, alignItems: 'end', height: 90 }} aria-label="Fleet kilometres per hour">
              {HOURS.map((h) => {
                const v = data.hourTotals[h];
                const future = isToday && h > hourNow;
                return (
                  <div
                    key={h}
                    title={`${hh(h)}–${hh((h + 1) % 24)}: ${km(v)} km`}
                    style={{
                      height: `${Math.max(v > 0 ? 6 : 2, (v / stats.barMax) * 100)}%`,
                      borderRadius: 3,
                      background: future ? 'var(--surface-3)' : h === stats.peak && v > 0 ? 'var(--green)' : 'color-mix(in srgb, var(--green) 45%, transparent)',
                    }}
                  />
                );
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 3, marginTop: 4 }}>
              {HOURS.map((h) => (
                <span key={h} className="muted mono" style={{ fontSize: 10, textAlign: 'center' }}>{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>
              ))}
            </div>
          </div>

          {/* Per ambulance per hour */}
          <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)' }}>
            <table className="mono tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1080 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={{ position: 'sticky', left: 0, background: 'var(--surface-2)', textAlign: 'left', padding: '8px 12px', fontFamily: 'inherit', fontWeight: 600, color: 'var(--muted)' }}>Ambulance</th>
                  {HOURS.map((h) => (
                    <th key={h} style={{ padding: '8px 2px', fontWeight: 600, color: 'var(--muted)', minWidth: 36 }}>{String(h).padStart(2, '0')}</th>
                  ))}
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--ink)' }}>Total km</th>
                </tr>
              </thead>
              <tbody>
                {data.vehicles.map((v) => (
                  <tr key={v.vehicleId} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--surface)', padding: '6px 12px', fontWeight: 700, whiteSpace: 'nowrap' }}>{v.registrationNumber}</td>
                    {v.hours.map((value, h) => {
                      const future = isToday && h > hourNow;
                      const strength = value > 0 ? 0.12 + 0.6 * (value / stats.cellMax) : 0;
                      return (
                        <td
                          key={h}
                          title={`${v.registrationNumber} · ${hh(h)}–${hh((h + 1) % 24)}: ${km(value)} km`}
                          style={{
                            textAlign: 'center',
                            padding: '6px 2px',
                            color: value > 0 ? 'var(--ink)' : 'var(--muted-2)',
                            background: future ? 'var(--surface-2)' : value > 0 ? `color-mix(in srgb, var(--green) ${Math.round(strength * 100)}%, transparent)` : undefined,
                          }}
                        >
                          {future ? '' : value > 0 ? km(value) : '·'}
                        </td>
                      );
                    })}
                    <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 700 }}>{km(v.totalKm)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-strong)', background: 'var(--surface-2)' }}>
                  <td style={{ position: 'sticky', left: 0, background: 'var(--surface-2)', padding: '8px 12px', fontWeight: 700, fontFamily: 'inherit' }}>All ambulances</td>
                  {data.hourTotals.map((value, h) => (
                    <td key={h} style={{ textAlign: 'center', padding: '8px 2px', fontWeight: 600 }}>{isToday && h > hourNow ? '' : value > 0 ? km(value) : '·'}</td>
                  ))}
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--green)' }}>{km(data.totalKm)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="muted card-pad" style={{ fontSize: 11.5, paddingTop: 10, paddingBottom: 12 }}>
            {data.source === 'ODOMETER'
              ? 'From the trackers’ odometers.'
              : 'Measured from the GPS track every ~65 seconds (straight-line legs between fixes, so winding roads read slightly low). Parked-vehicle drift and GPS jumps are ignored.'}
            {data.source === null && ' Distance is recorded from when this feature was switched on.'}
          </p>
        </>
      )}
    </div>
  );
}

export default HourlyDistanceCard;
