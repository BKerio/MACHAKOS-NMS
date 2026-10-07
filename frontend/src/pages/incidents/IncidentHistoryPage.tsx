import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Ambulance,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  History,
  MapPin,
  Search,
  Siren,
  UserX,
  X as XIcon,
} from 'lucide-react';
import api from '@/api/client';
import LoadingState from '@/components/shared/LoadingState';
import { useAuthStore } from '@/stores/authStore';
import { caseTitle, incidentPath, unknownLabel } from '@/lib/incidentPath';
import type { Incident, IncidentStatus } from '@/types/api';

/*
 * Incident history: every case, newest first, searchable and filterable.
 * Filters live in the URL (?status=RESOLVED&range=7d&q=...) so a view can be
 * shared or bookmarked. Watchers see only the cases they logged (enforced by
 * the API, not just here).
 */

const PAGE_SIZE = 25;
const NBO = 'Africa/Nairobi';

type Row = Incident & {
  tasks?: { status: string; vehicle: { registrationNumber: string } }[];
  targetFacility?: { name: string } | null;
  originFacility?: { name: string } | null;
};

const STATUS_TABS: { key: '' | IncidentStatus; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'SUBMITTED', label: 'Waiting' },
  { key: 'DISPATCH_HANDLING', label: 'Handling' },
  { key: 'DISPATCH_ON_HOLD', label: 'On hold' },
  { key: 'DISPATCHED', label: 'Dispatched' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'DRAFT', label: 'Drafts' },
];

const STATUS_STYLE: Record<IncidentStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'var(--muted)' },
  SUBMITTED: { label: 'Waiting', color: 'var(--red)' },
  DISPATCH_HANDLING: { label: 'Handling', color: 'var(--amber)' },
  DISPATCH_ON_HOLD: { label: 'On hold', color: 'var(--amber)' },
  DISPATCHED: { label: 'Dispatched', color: 'var(--blue)' },
  RESOLVED: { label: 'Resolved', color: 'var(--color-status-success)' },
};

const RANGES = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'custom', label: 'Custom' },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

/** Nairobi calendar day as YYYY-MM-DD, `back` days ago. */
function nairobiDay(back = 0) {
  const d = new Date(Date.now() - back * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: NBO });
}

function rangeDates(range: RangeKey, from: string, to: string): { from?: string; to?: string } {
  switch (range) {
    case 'today': return { from: nairobiDay(0) };
    case '7d': return { from: nairobiDay(6) };
    case '30d': return { from: nairobiDay(29) };
    case 'custom': return { from: from || undefined, to: to || undefined };
    default: return {};
  }
}

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d} d ago` : '';
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: NBO, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Debounce a fast-changing value (search box). */
function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function StatusPill({ status }: { status: IncidentStatus }) {
  const s = STATUS_STYLE[status] ?? { label: status, color: 'var(--muted)' };
  return (
    <span
      className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap"
      style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 12%, var(--surface))` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

function Flags({ inc }: { inc: Row }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {inc.incidentType === 'REFERRAL' && (
        <span className="pill pill-blue" style={{ fontSize: 10, padding: '2px 6px' }}><ArrowRightLeft size={10} /> Referral</span>
      )}
      {inc.massCasualty && <span className="pill pill-red" style={{ fontSize: 10, padding: '2px 6px' }}>MCI</span>}
      {inc.patientUnknown && (
        <span className="pill pill-amber" style={{ fontSize: 10, padding: '2px 6px' }}><UserX size={10} /> Not identified</span>
      )}
      {!inc.patientUnknown && unknownLabel(inc) && (
        <span className="pill pill-gray" style={{ fontSize: 10, padding: '2px 6px' }} title="Identified after being logged as unknown">
          was {unknownLabel(inc)}
        </span>
      )}
    </span>
  );
}

function place(inc: Row) {
  if (inc.incidentType === 'REFERRAL') {
    return `${inc.originFacility?.name ?? inc.locationName} → ${inc.targetFacility?.name ?? inc.placeOfReferral ?? 'facility at dispatch'}`;
  }
  return inc.locationName;
}

function patient(inc: Row) {
  return [inc.patientName, inc.patientAge && /^\d+$/.test(inc.patientAge) ? `${inc.patientAge} yrs` : inc.patientAge, inc.patientGender]
    .filter(Boolean)
    .join(' · ');
}

export default function IncidentHistoryPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isWatcher = user?.role === 'WATCHER';
  const [params, setParams] = useSearchParams();

  const status = (params.get('status') ?? '') as '' | IncidentStatus;
  const type = (params.get('type') ?? '') as '' | 'EMERGENCY' | 'REFERRAL';
  const subCounty = params.get('subCounty') ?? '';
  const range = (params.get('range') ?? 'all') as RangeKey;
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [q, setQ] = useState(params.get('q') ?? '');
  const search = useDebounced(q.trim());

  /** Update URL filters; any filter change returns to page 1. */
  const setFilter = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('q') ?? '') !== search) setFilter({ q: search });
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const dates = rangeDates(range, from, to);
  const baseQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (type) p.set('type', type);
    if (subCounty) p.set('subCounty', subCounty);
    if (dates.from) p.set('from', dates.from);
    if (dates.to) p.set('to', dates.to);
    return p;
  }, [search, type, subCounty, dates.from, dates.to]);

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['incidents', 'history', baseQuery.toString(), status, page],
    queryFn: async () => {
      const p = new URLSearchParams(baseQuery);
      if (status) p.set('status', status);
      p.set('page', String(page));
      p.set('limit', String(PAGE_SIZE));
      const res = await api.get(`/incidents?${p}`);
      return res.data as { data: Row[]; meta: { total: number; page: number; totalPages: number } };
    },
    placeholderData: keepPreviousData,
  });

  // Per-status counts for the tabs, under the same search/type/date filters.
  const { data: counts } = useQuery({
    queryKey: ['incidents', 'history-counts', baseQuery.toString()],
    queryFn: async () => {
      const entries = await Promise.all(
        STATUS_TABS.map(async (t) => {
          const p = new URLSearchParams(baseQuery);
          if (t.key) p.set('status', t.key);
          p.set('limit', '1');
          const res = await api.get(`/incidents?${p}`);
          return [t.key, res.data.meta?.total ?? 0] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
    placeholderData: keepPreviousData,
  });

  const { data: subCounties = [] } = useQuery<string[]>({
    queryKey: ['sub-counties'],
    queryFn: async () => (await api.get('/incidents/sub-counties')).data.data,
    staleTime: 5 * 60_000,
  });

  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.max(1, data?.meta.totalPages ?? 1);
  const firstShown = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastShown = Math.min(page * PAGE_SIZE, total);
  const filtered = !!(search || type || subCounty || range !== 'all' || status);

  return (
    <div className="flex flex-col gap-5 min-w-0">
      {/* Header */}
      <div className="card card-pad flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
        <span className="w-11 h-11 rounded-xl grid place-items-center shrink-0" style={{ background: 'color-mix(in srgb, var(--blue) 12%, var(--surface))' }}>
          <History size={22} color="var(--blue)" />
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--ink)' }}>Incident history</h1>
          <p className="text-[13px]" style={{ color: 'var(--muted)' }}>
            {isWatcher ? 'Every case you have logged, newest first.' : 'Every case in the system, newest first. Open one to see its full record.'}
          </p>
        </div>
        <Link to="/incidents/new" className="btn btn-primary whitespace-nowrap">
          <CirclePlus size={16} /> Report incident
        </Link>
      </div>

      {/* Filters */}
      <div className="card card-pad flex flex-col gap-3.5 min-w-0">
        {/* Status tabs with counts */}
        <div className="flex gap-1.5 overflow-x-auto max-w-full min-w-0 -mx-1 px-1 pb-0.5" role="tablist">
          {STATUS_TABS.map((t) => {
            const on = status === t.key;
            return (
              <button
                key={t.key || 'all'}
                role="tab"
                aria-selected={on}
                onClick={() => setFilter({ status: t.key })}
                className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-[13px] font-semibold whitespace-nowrap border transition-colors"
                style={on
                  ? { background: 'var(--ink)', color: 'var(--surface)', borderColor: 'var(--ink)' }
                  : { background: 'var(--surface)', color: 'var(--ink-2)', borderColor: 'var(--border)' }}
              >
                {t.label}
                {counts && (
                  <span
                    className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] grid place-items-center tabular-nums"
                    style={on ? { background: 'color-mix(in srgb, var(--surface) 22%, transparent)' } : { background: 'var(--surface-3)', color: 'var(--muted)' }}
                  >
                    {counts[t.key] ?? 0}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_200px]">
          <label className="relative block min-w-0 sm:col-span-2 lg:col-span-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-2)' }} />
            <input
              className="input w-full"
              style={{ paddingLeft: 36, paddingRight: q ? 34 : undefined }}
              placeholder="Search case no., patient, Unknown 3, ID / phone, location, complaint…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded" style={{ color: 'var(--muted)' }}>
                <XIcon size={14} />
              </button>
            )}
          </label>
          <select className="eoc-select" value={type} onChange={(e) => setFilter({ type: e.target.value })} aria-label="Case type">
            <option value="">All types</option>
            <option value="EMERGENCY">Emergency</option>
            <option value="REFERRAL">Referral</option>
          </select>
          <select className="eoc-select" value={subCounty} onChange={(e) => setFilter({ subCounty: e.target.value })} aria-label="Sub-county">
            <option value="">All sub-counties</option>
            {subCounties.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setFilter({ range: r.key === 'all' ? '' : r.key, ...(r.key !== 'custom' ? { from: '', to: '' } : {}) })}
              className="h-8 px-3 rounded-full text-[12.5px] font-semibold border transition-colors"
              style={range === r.key
                ? { background: 'color-mix(in srgb, var(--blue) 12%, var(--surface))', color: 'var(--blue)', borderColor: 'color-mix(in srgb, var(--blue) 35%, transparent)' }
                : { background: 'var(--surface)', color: 'var(--ink-2)', borderColor: 'var(--border)' }}
            >
              {r.label}
            </button>
          ))}
          {range === 'custom' && (
            <span className="inline-flex items-center gap-2">
              <input type="date" className="input" style={{ height: 32, width: 150 }} value={from} max={to || undefined} onChange={(e) => setFilter({ range: 'custom', from: e.target.value })} aria-label="From" />
              <span className="text-[12px]" style={{ color: 'var(--muted)' }}>to</span>
              <input type="date" className="input" style={{ height: 32, width: 150 }} value={to} min={from || undefined} onChange={(e) => setFilter({ range: 'custom', to: e.target.value })} aria-label="To" />
            </span>
          )}
          {filtered && (
            <button
              type="button"
              onClick={() => { setQ(''); setParams(new URLSearchParams(), { replace: true }); }}
              className="ml-auto text-[12.5px] font-semibold underline-offset-2 hover:underline"
              style={{ color: 'var(--muted)' }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b text-[12.5px]" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
          <span>
            {total ? <>Showing <b style={{ color: 'var(--ink)' }}>{firstShown}-{lastShown}</b> of <b style={{ color: 'var(--ink)' }}>{total}</b> cases</> : isLoading ? 'Loading…' : 'No cases'}
          </span>
          {isFetching && !isLoading && <span>Updating…</span>}
        </div>

        {isLoading ? (
          <LoadingState minHeight={240} label="Loading incident history…" />
        ) : isError ? (
          <p className="p-8 text-center text-sm" style={{ color: 'var(--red)' }}>Couldn't load the history. Check your connection and try again.</p>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <Siren size={30} className="mx-auto" style={{ color: 'var(--muted-2)' }} />
            <p className="text-sm font-semibold mt-3" style={{ color: 'var(--ink)' }}>{filtered ? 'No cases match these filters' : 'No cases logged yet'}</p>
            <p className="text-[13px] mt-1" style={{ color: 'var(--muted)' }}>
              {filtered ? 'Try a wider date range or clear the filters.' : 'Cases appear here as soon as they are reported.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="tbl-wrap hidden md:block">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Logged</th>
                    <th>What happened</th>
                    <th>Where</th>
                    <th>Patient</th>
                    <th>Ambulance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((inc) => (
                    <tr key={inc.id} onClick={() => navigate(incidentPath(inc))}>
                      <td>
                        <Link to={incidentPath(inc)} onClick={(e) => e.stopPropagation()} className="mono strong whitespace-nowrap" style={{ color: 'var(--blue)' }}>
                          {caseTitle(inc)}
                        </Link>
                        <div className="mt-1"><Flags inc={inc} /></div>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="strong tabular-nums">{when(inc.createdAt)}</div>
                        <div className="text-[12px]" style={{ color: 'var(--muted)' }}>{ago(inc.createdAt)}</div>
                      </td>
                      <td style={{ maxWidth: 280 }}>
                        <div className="strong truncate">{inc.alertNature ?? '-'}</div>
                        <div className="text-[12px] truncate" style={{ color: 'var(--muted)' }} title={inc.chiefComplaint}>{inc.chiefComplaint}</div>
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        <div className="truncate" title={place(inc)}>{place(inc)}</div>
                        {inc.subCounty && <div className="text-[12px]" style={{ color: 'var(--muted)' }}>{inc.subCounty}</div>}
                      </td>
                      <td className="whitespace-nowrap">{patient(inc) || <span style={{ color: 'var(--muted-2)' }}>-</span>}</td>
                      <td className="whitespace-nowrap mono">{inc.tasks?.[0]?.vehicle.registrationNumber ?? <span style={{ color: 'var(--muted-2)' }}>-</span>}</td>
                      <td><StatusPill status={inc.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone cards */}
            <ul className="md:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
              {rows.map((inc) => (
                <li key={inc.id}>
                  <Link to={incidentPath(inc)} className="block px-4 py-3.5" style={{ color: 'inherit' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono font-semibold" style={{ color: 'var(--blue)' }}>{caseTitle(inc)}</span>
                      <StatusPill status={inc.status} />
                    </div>
                    <p className="text-[13.5px] font-semibold mt-1.5" style={{ color: 'var(--ink)' }}>{inc.alertNature ?? inc.chiefComplaint}</p>
                    <p className="text-[12.5px] mt-1 flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                      <MapPin size={12} className="shrink-0" /> <span className="truncate">{place(inc)}</span>
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap text-[12px]" style={{ color: 'var(--muted)' }}>
                      <span className="tabular-nums">{when(inc.createdAt)}</span>
                      {inc.tasks?.[0] && (
                        <span className="inline-flex items-center gap-1"><Ambulance size={12} /> {inc.tasks[0].vehicle.registrationNumber}</span>
                      )}
                      <Flags inc={inc} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={page <= 1}
                  onClick={() => { setFilter({ page: String(page - 1) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                >
                  <ChevronLeft size={15} /> Newer
                </button>
                <span className="text-[12.5px] tabular-nums" style={{ color: 'var(--muted)' }}>Page {page} of {totalPages}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => { setFilter({ page: String(page + 1) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                >
                  Older <ChevronRight size={15} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
