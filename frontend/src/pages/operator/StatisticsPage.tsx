import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarDays, Clock, Gauge, TrendingDown, TrendingUp, Minus, Zap } from 'lucide-react';
import { getErrorMessage, getTaskHistory } from '@/api/responder';
import LoadingState from '@/components/shared/LoadingState';
import type { TaskHistoryItem } from '@/types/api';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_AREAS = 4;

type Range = 'week' | 'months';
type Bucket = { label: string; full: string; count: number };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
function duration(ms: number) {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

/**
 * The numbers behind the page, from the responder's ended cases - the same
 * maths as the app's CaseStats (statistics/case_stats.dart).
 */
function useCaseStats(tasks: TaskHistoryItem[]) {
  return useMemo(() => {
    const assigned = tasks.map((t) => new Date(t.receivedAt)).filter((d) => !Number.isNaN(d.getTime()));
    const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
    const cancelled = tasks.filter((t) => t.status === 'CANCELLED').length;
    const transferred = tasks.filter((t) => t.status === 'HANDED_OVER').length;
    const sceneTimes = tasks
      .filter((t) => t.sceneArrivalAt)
      .map((t) => new Date(t.sceneArrivalAt!).getTime() - new Date(t.receivedAt).getTime())
      .filter((ms) => ms > 0);

    const byArea = new Map<string, number>();
    for (const t of tasks) {
      const a = t.incident.subCounty?.trim() || 'Unknown';
      byArea.set(a, (byArea.get(a) ?? 0) + 1);
    }
    const sorted = [...byArea.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const rest = sorted.slice(MAX_AREAS).reduce((s, [, n]) => s + n, 0);
    const areas = [...sorted.slice(0, MAX_AREAS), ...(rest > 0 ? [['Other', rest] as [string, number]] : [])];

    const today = startOfDay(new Date());
    const day = 86400000;
    const thisWeekFrom = today.getTime() - 6 * day;
    const lastWeekFrom = today.getTime() - 13 * day;
    const thisWeek = assigned.filter((d) => d.getTime() >= thisWeekFrom).length;
    const lastWeek = assigned.filter((d) => d.getTime() >= lastWeekFrom && d.getTime() < thisWeekFrom).length;

    const weekBuckets: Bucket[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today.getTime() - (6 - i) * day);
      return {
        label: i === 6 ? 'Today' : WEEKDAYS[d.getDay()],
        full: d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
        count: assigned.filter((x) => startOfDay(x).getTime() === d.getTime()).length,
      };
    });
    const monthBuckets: Bucket[] = Array.from({ length: 6 }, (_, i) => {
      const m = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1);
      return {
        label: MONTHS[m.getMonth()],
        full: m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        count: assigned.filter((x) => x.getFullYear() === m.getFullYear() && x.getMonth() === m.getMonth()).length,
      };
    });

    const byWeekday = Array(7).fill(0);
    const byHour = Array(24).fill(0);
    for (const d of assigned) { byWeekday[d.getDay()]++; byHour[d.getHours()]++; }
    const argmax = (xs: number[]) => xs.reduce((best, v, i) => (v > xs[best] ? i : best), 0);
    const busiest = assigned.length ? argmax(byWeekday) : null;
    const peak = assigned.length ? argmax(byHour) : null;

    return {
      total: tasks.length,
      completed, cancelled, transferred,
      rate: tasks.length ? completed / tasks.length : 0,
      avgToScene: sceneTimes.length ? sceneTimes.reduce((a, b) => a + b, 0) / sceneTimes.length : null,
      fastest: sceneTimes.length ? Math.min(...sceneTimes) : null,
      areas, thisWeek, lastWeek, weekBuckets, monthBuckets,
      busiest: busiest == null ? null : { day: WEEKDAY_NAMES[busiest], count: byWeekday[busiest] },
      peak: peak == null ? null : { hour: peak, count: byHour[peak] },
    };
  }, [tasks]);
}

/** Completion rate as a ring on the navy hero. */
function Ring({ rate }: { rate: number }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`${Math.round(rate * 100)} percent of cases completed`}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="8" />
      <circle
        cx="44" cy="44" r={r} fill="none" stroke="var(--green-bright, #5FD79A)" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${c * rate} ${c}`} transform="rotate(-90 44 44)" style={{ transition: 'stroke-dasharray .8s ease' }}
      />
      <text x="44" y="44" textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="19" fontWeight="700">
        {Math.round(rate * 100)}%
      </text>
    </svg>
  );
}

/** Single-series bar chart: one hue, hover shows the value, the busiest bar is labelled directly. */
function BarChart({ buckets }: { buckets: Bucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const peakIdx = buckets.reduce((best, b, i) => (b.count > buckets[best].count ? i : best), 0);
  return (
    <div>
      <div className="flex items-end gap-2" style={{ height: 170 }} onMouseLeave={() => setHover(null)}>
        {buckets.map((b, i) => {
          const isPeak = i === peakIdx && b.count > 0;
          const showLabel = hover === i || (hover == null && isPeak);
          return (
            <div
              key={b.full}
              className="flex-1 h-full flex flex-col justify-end items-center relative"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              aria-label={`${b.full}: ${plural(b.count, 'case')}`}
              style={{ outline: 'none' }}
            >
              {showLabel && (
                <span className="text-xs font-bold mb-1 mono" style={{ color: 'var(--ink)' }}>{b.count}</span>
              )}
              <div
                className="w-full"
                style={{
                  maxWidth: 44,
                  height: `${b.count ? Math.max(4, (b.count / max) * 100) : 0}%`,
                  minHeight: b.count ? 4 : 2,
                  borderRadius: '4px 4px 0 0',
                  background: b.count ? 'var(--green)' : 'var(--border)',
                  opacity: hover == null || hover === i ? 1 : 0.45,
                  transition: 'height .5s ease, opacity .15s',
                }}
              />
              {hover === i && (
                <div
                  className="absolute z-10 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap pointer-events-none"
                  style={{ bottom: '100%', marginBottom: 4, background: 'var(--ink)', color: 'var(--surface)' }}
                >
                  {b.full} · {plural(b.count, 'case')}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
        {buckets.map((b, i) => (
          <span key={b.full} className="flex-1 text-center text-[11px]" style={{ color: hover === i ? 'var(--ink)' : 'var(--muted)', fontWeight: b.label === 'Today' ? 700 : 500 }}>
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatisticsPage() {
  const [range, setRange] = useState<Range>('week');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['operator', 'history', 'stats'],
    queryFn: () => getTaskHistory(1, 500),
  });
  const tasks = data?.data ?? [];
  const s = useCaseStats(tasks);
  const change = s.thisWeek - s.lastWeek;
  const areaMax = Math.max(1, ...s.areas.map(([, n]) => n));

  return (
    <div className="col mx-auto w-full" style={{ gap: 20, maxWidth: 880 }}>
      <div>
        <p className="eyebrow">Field operations</p>
        <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Statistics</h2>
      </div>

      {isLoading ? (
        <LoadingState minHeight={240} />
      ) : error ? (
        <div className="card card-pad text-center">
          <p className="text-sm" style={{ color: 'var(--red)' }}>{getErrorMessage(error)}</p>
          <button onClick={() => refetch()} className="btn btn-primary btn-sm mt-3">Retry</button>
        </div>
      ) : s.total === 0 ? (
        <div className="card card-pad text-center" style={{ padding: 48 }}>
          <BarChart3 size={40} style={{ color: 'var(--muted-2)' }} className="mx-auto mb-4" />
          <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>No cases yet</p>
          <p className="text-sm mt-2 max-w-md mx-auto" style={{ color: 'var(--muted)' }}>
            Your service record builds up here as you complete cases.
          </p>
        </div>
      ) : (
        <>
          {/* Navy service-record hero */}
          <div className="rounded-2xl p-5 flex flex-wrap items-center gap-x-8 gap-y-5" style={{ background: 'var(--nav-bg)', color: '#fff' }}>
            <div className="flex-1 min-w-[160px]">
              <p className="text-[11px] font-bold tracking-widest" style={{ color: 'rgba(255,255,255,.6)' }}>YOUR SERVICE RECORD</p>
              <p className="font-bold leading-none mt-3" style={{ fontSize: 44 }}>{s.total}</p>
              <p className="text-sm mt-1.5" style={{ color: 'rgba(255,255,255,.7)' }}>cases responded to</p>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 mt-3 text-xs font-bold"
                style={{
                  background: 'rgba(255,255,255,.1)',
                  color: change > 0 ? 'var(--green-bright, #5FD79A)' : change < 0 ? 'var(--gold)' : 'rgba(255,255,255,.7)',
                }}
              >
                {change > 0 ? <TrendingUp size={13} /> : change < 0 ? <TrendingDown size={13} /> : <Minus size={13} />}
                {change === 0 ? 'Same as last week' : `${change > 0 ? '+' : ''}${change} vs last week`}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <Ring rate={s.rate} />
              <p className="text-[10.5px] font-bold tracking-widest mt-1" style={{ color: 'rgba(255,255,255,.6)' }}>COMPLETED</p>
            </div>
          </div>

          {/* Headline metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Completed', value: String(s.completed) },
              { label: 'Cancelled', value: String(s.cancelled) },
              { label: 'Transferred', value: String(s.transferred) },
              { label: 'Avg to scene', value: s.avgToScene == null ? '–' : duration(s.avgToScene) },
            ].map((m) => (
              <div key={m.label} className="card card-pad">
                <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{m.label}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Cases over time */}
          <div className="card card-pad">
            <div className="flex items-center justify-between gap-3 mb-5">
              <p className="label" style={{ margin: 0 }}>Cases over time</p>
              <div className="seg" role="tablist" aria-label="Period">
                <button role="tab" aria-selected={range === 'week'} className={range === 'week' ? 'on' : ''} onClick={() => setRange('week')}>Week</button>
                <button role="tab" aria-selected={range === 'months'} className={range === 'months' ? 'on' : ''} onClick={() => setRange('months')}>6 months</button>
              </div>
            </div>
            <BarChart buckets={range === 'week' ? s.weekBuckets : s.monthBuckets} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Where they've responded */}
            <div className="card card-pad">
              <p className="label mb-4" style={{ margin: 0 }}>Cases by sub-county</p>
              <div className="col mt-4" style={{ gap: 12 }}>
                {s.areas.map(([name, n]) => (
                  <div key={name}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-semibold truncate" style={{ color: 'var(--ink)' }}>{name}</span>
                      <span style={{ color: 'var(--muted)' }}>
                        <b style={{ color: 'var(--ink)' }}>{n}</b> · {Math.round((n / s.total) * 100)}%
                      </span>
                    </div>
                    <div className="mt-1.5 rounded-full" style={{ height: 8, background: 'var(--surface-3)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(n / areaMax) * 100}%`, background: name === 'Other' ? 'var(--muted-2)' : 'var(--green)', transition: 'width .6s ease' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Highlights */}
            <div className="card card-pad">
              <p className="label" style={{ margin: 0 }}>Highlights</p>
              <div className="col mt-4" style={{ gap: 14 }}>
                <Highlight Icon={CalendarDays} label="Busiest day" value={s.busiest?.day ?? '–'} detail={s.busiest ? plural(s.busiest.count, 'case') : ''} />
                <Highlight Icon={Clock} label="Peak hour" value={s.peak ? hourLabel(s.peak.hour) : '–'} detail={s.peak ? plural(s.peak.count, 'case') : ''} />
                <Highlight Icon={Zap} label="Fastest to scene" value={s.fastest == null ? '–' : duration(s.fastest)} detail="From assignment" />
                <Highlight Icon={Gauge} label="Last 7 days" value={plural(s.thisWeek, 'case')} detail={`${s.lastWeek} the week before`} />
              </div>
            </div>
          </div>

          {data?.meta && data.meta.total > tasks.length && (
            <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
              Based on your {tasks.length} most recent of {data.meta.total} cases.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Highlight({ Icon, label, value, detail }: { Icon: typeof Clock; label: string; value: string; detail: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid place-items-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: 'var(--green-light)' }}>
        <Icon size={18} style={{ color: 'var(--green)' }} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs" style={{ color: 'var(--muted)' }}>{label}</p>
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{value}</p>
      </div>
      <span className="text-xs" style={{ color: 'var(--muted)' }}>{detail}</span>
    </div>
  );
}

export default StatisticsPage;
