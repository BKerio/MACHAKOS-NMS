import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown, ChevronUp, Clock as ClockIcon, CloudUpload, FileText, Eye, Hospital, Star, ArrowLeftRight, Pencil,
} from 'lucide-react';
import AppLoader from '@/components/shared/AppLoader';
import { getTaskHistory, getPatientCareReports, getPatientCareReportFileUrl, getErrorMessage } from '@/api/responder';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import StatusBadge from '@/components/operator/StatusBadge';
import ActivityTimeline from '@/components/operator/ActivityTimeline';
import { buildTaskActivities, formatActivityTime } from '@/utils/taskActivities';
import { STATUS_LABELS } from '@/utils/taskStatus';
import { pcrPath, ratingPath } from '@/utils/caseFlow';
import type { FacilityRating, PatientCareReport, TaskHistoryItem } from '@/types/api';
import LoadingState from '@/components/shared/LoadingState';

const CREW = ['DRIVER', 'EMT', 'NURSE'];
const WORDS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
type Filter = 'all' | 'completed' | 'cancelled' | 'needsPcr';

const needsPcr = (t: TaskHistoryItem) => t.status === 'COMPLETED' && (t.pcrCount ?? 0) === 0;
const matches = (t: TaskHistoryItem, f: Filter) =>
  f === 'all' ? true : f === 'completed' ? t.status === 'COMPLETED' : f === 'cancelled' ? t.status === 'CANCELLED' : needsPcr(t);

function fileTypeLabel(mimeType: string) {
  if (mimeType.startsWith('image/')) return 'Photo';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('word')) return 'Word document';
  return 'File';
}

const dayKey = (iso: string) => new Date(iso).toDateString();
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const minutes = (ms: number) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

function Stars({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex" aria-label={`${value.toFixed(1)} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} strokeWidth={1.8} fill={n <= Math.round(value) ? 'var(--gold)' : 'transparent'} color={n <= Math.round(value) ? 'var(--gold)' : 'var(--border-strong)'} />
      ))}
    </span>
  );
}

/** Service-record hero: totals, PCR filing, average time to scene and a 14-day strip (the app's History hero). */
function HistoryHero({ items, total }: { items: TaskHistoryItem[]; total: number }) {
  const completed = items.filter((t) => t.status === 'COMPLETED');
  const filed = completed.filter((t) => (t.pcrCount ?? 0) > 0).length;
  const toScene = items
    .filter((t) => t.sceneArrivalAt)
    .map((t) => new Date(t.sceneArrivalAt!).getTime() - new Date(t.receivedAt).getTime())
    .filter((ms) => ms > 0);
  const avg = toScene.length ? toScene.reduce((a, b) => a + b, 0) / toScene.length : null;

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (13 - i));
    return { key: d.toDateString(), count: items.filter((t) => dayKey(t.receivedAt) === d.toDateString()).length, today: i === 13 };
  });
  const peak = Math.max(1, ...days.map((d) => d.count));

  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--nav-bg)', color: '#fff' }}>
      <p className="text-[11px] font-bold tracking-widest" style={{ color: 'rgba(255,255,255,.6)' }}>YOUR SERVICE RECORD</p>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <HeroStat value={String(completed.length)} label="Completed" />
        <HeroStat value={completed.length ? `${filed}/${completed.length}` : '–'} label="PCR filed" />
        <HeroStat value={avg == null ? '–' : minutes(avg)} label="Avg to scene" />
      </div>
      <div className="mt-4">
        <div className="flex items-end gap-1" style={{ height: 36 }} aria-label="Cases in the last 14 days">
          {days.map((d) => (
            <div
              key={d.key}
              title={`${d.key}: ${d.count} case${d.count === 1 ? '' : 's'}`}
              className="flex-1 rounded-sm"
              style={{
                height: `${d.count ? Math.max(18, (d.count / peak) * 100) : 8}%`,
                background: d.today ? 'var(--gold)' : d.count ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.15)',
              }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10.5px] mt-1.5" style={{ color: 'rgba(255,255,255,.55)' }}>
          <span>14 days ago</span>
          <span style={{ color: 'var(--gold)', fontWeight: 700 }}>Today</span>
        </div>
      </div>
      {items.length < total && (
        <p className="text-[11px] mt-2" style={{ color: 'rgba(255,255,255,.5)' }}>Based on the {items.length} most recent of {total} cases.</p>
      )}
    </div>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-bold leading-none" style={{ fontSize: 24 }}>{value}</p>
      <p className="text-[11px] mt-1.5" style={{ color: 'rgba(255,255,255,.6)' }}>{label}</p>
    </div>
  );
}

/** Accepted · at scene · patient on board · at hospital - filled up to the last stage reached. */
function StageStrip({ item }: { item: TaskHistoryItem }) {
  const done = [item.acceptedAt, item.sceneArrivalAt, item.patientPickAt, item.facilityArrivalAt].filter(Boolean).length;
  const color = item.status === 'CANCELLED' ? 'var(--red)' : item.status === 'HANDED_OVER' ? 'var(--gold)' : 'var(--green)';
  return (
    <div className="flex gap-1 mt-2.5" aria-label={`${done} of 4 stages reached`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="flex-1 rounded-full" style={{ height: 4, background: i < done ? color : 'var(--border)' }} />
      ))}
    </div>
  );
}

function RatingCard({
  item, myId, canRate, onRate,
}: { item: TaskHistoryItem; myId?: string; canRate: boolean; onRate: (mine?: FacilityRating) => void }) {
  const ratings = item.facilityRatings ?? [];
  const mine = ratings.find((r) => r.userId === myId);
  const avg = ratings.length ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length : null;
  const roleLabel = (r?: string) => (r === 'DRIVER' ? 'Driver' : r === 'EMT' ? 'EMT' : r === 'NURSE' ? 'Nurse' : '');

  return (
    <div className="rounded-xl border p-4 mt-5" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-3">
        <span className="grid place-items-center rounded-lg flex-shrink-0" style={{ width: 36, height: 36, background: 'var(--green-light)' }}>
          <Hospital size={18} style={{ color: 'var(--green)' }} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Facility rating</p>
          <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{item.incident.targetFacility?.name}</p>
        </div>
      </div>
      {avg == null ? (
        <div className="flex items-center gap-2 mt-3">
          <Stars value={0} size={18} />
          <span className="text-sm" style={{ color: 'var(--muted)' }}>Not rated yet</span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mt-3">
            <span className="font-bold" style={{ fontSize: 28, color: 'var(--ink)' }}>{avg.toFixed(1)}</span>
            <div>
              <Stars value={avg} size={17} />
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {WORDS[Math.min(4, Math.max(0, Math.round(avg) - 1))]} · {ratings.length} crew rating{ratings.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          {ratings.map((r) => (
            <div key={r.id} className="border-t mt-3 pt-3" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--ink)' }}>
                  {[r.userId === myId ? 'You' : r.user?.name ?? 'Crew member', roleLabel(r.user?.role)].filter(Boolean).join(' · ')}
                </span>
                <Stars value={r.stars} size={14} />
              </div>
              {r.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {r.tags.map((t) => <span key={t} className="pill pill-gray" style={{ fontSize: 11 }}>{t}</span>)}
                </div>
              )}
              {r.comment && <p className="text-sm italic mt-2" style={{ color: 'var(--muted)' }}>"{r.comment}"</p>}
            </div>
          ))}
        </>
      )}
      {canRate && (
        <button onClick={() => onRate(mine)} className="btn btn-soft btn-sm mt-4">
          {mine ? <Pencil size={14} /> : <Star size={14} />} {mine ? 'Change your rating' : 'Rate this facility'}
        </button>
      )}
    </div>
  );
}

function TransferCard({ item }: { item: TaskHistoryItem }) {
  const handedOn = item.status === 'HANDED_OVER';
  const to = item.nextTask?.vehicle?.registrationNumber;
  const from = item.previousTask?.vehicle?.registrationNumber;
  return (
    <div className="rounded-xl p-3.5 mt-4 flex gap-2.5" style={{ background: 'var(--amber-soft)' }}>
      <ArrowLeftRight size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--amber)' }} />
      <div className="min-w-0 text-sm">
        <p className="font-bold" style={{ color: 'var(--amber)' }}>
          {handedOn ? `Transferred to ${to ?? 'dispatch'}` : `Transferred from ${from ?? 'another ambulance'}`}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>
          {handedOn
            ? [
                to ? 'Another crew finished this case.' : 'No ambulance was free, so dispatch took the case back.',
                item.handoverReason,
                item.handoverStage ? `At the "${STATUS_LABELS[item.handoverStage]}" stage` : null,
                item.handedOverAt ? formatActivityTime(item.handedOverAt) : null,
              ].filter(Boolean).join(' · ')
            : 'Your crew took this case over and finished it.'}
        </p>
      </div>
    </div>
  );
}

function CaseCard({
  item, expanded, onToggle, isCrew, myId, onUploadPcr, onRate, pcrItems, isPcrLoading, pcrError, onRetryPcr, onViewPcr, viewingId,
}: {
  item: TaskHistoryItem;
  expanded: boolean;
  onToggle: () => void;
  isCrew: boolean;
  myId?: string;
  onUploadPcr: () => void;
  onRate: (mine?: FacilityRating) => void;
  pcrItems: PatientCareReport[] | null;
  isPcrLoading: boolean;
  pcrError: string | null;
  onRetryPcr: () => void;
  onViewPcr: (r: PatientCareReport) => void;
  viewingId: string | null;
}) {
  const pcrCount = item.pcrCount ?? 0;
  const activities = useMemo(() => buildTaskActivities(item, { live: false }), [item]);
  const ratings = item.facilityRatings ?? [];
  const avg = ratings.length ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length : null;
  const facility = item.incident.targetFacility?.name;
  const canUploadPcr = isCrew && item.status === 'COMPLETED';
  const transferred = item.status === 'HANDED_OVER' || !!item.previousTask;

  return (
    <div className="card card-pad">
      <button onClick={onToggle} className="w-full flex items-start gap-2.5 text-left" aria-expanded={expanded}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>{item.incident.caseNumber}</p>
            <StatusBadge status={item.status} />
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{item.incident.chiefComplaint}</p>
          <p className="text-xs mt-1.5" style={{ color: 'var(--muted-2)' }}>
            {clock(item.receivedAt)} · {item.vehicle.registrationNumber}{item.incident.locationName ? ` · ${item.incident.locationName}` : ''}
          </p>
          <StageStrip item={item} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            {facility && item.status === 'COMPLETED' && (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <Hospital size={13} /> <span className="truncate max-w-[180px]">{facility}</span>
                {avg != null ? <Stars value={avg} size={12} /> : <span style={{ color: 'var(--muted-2)', fontWeight: 700 }}>Not rated</span>}
              </span>
            )}
            {pcrCount > 0
              ? <span>{pcrCount} PCR</span>
              : needsPcr(item) && <span className="pill pill-amber" style={{ fontSize: 10.5 }}>PCR needed</span>}
          </div>
        </div>
        {expanded ? <ChevronUp size={18} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={18} style={{ color: 'var(--muted)' }} />}
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="label mb-3">Stages &amp; activity</p>
          <ActivityTimeline activities={activities} />

          {item.status === 'CANCELLED' && item.cancelReason && (
            <p className="text-sm mt-2" style={{ color: 'var(--red)' }}>{item.cancelReason}</p>
          )}
          {transferred && <TransferCard item={item} />}
          {item.status === 'COMPLETED' && facility && (
            <RatingCard item={item} myId={myId} canRate={isCrew} onRate={onRate} />
          )}

          <p className="label mt-5 mb-3">PCR reports</p>
          {isPcrLoading ? (
            <AppLoader size={22} color="var(--green)" />
          ) : pcrError ? (
            <div className="flex items-center gap-3">
              <p className="text-sm flex-1" style={{ color: 'var(--red)' }}>{pcrError}</p>
              <button onClick={onRetryPcr} className="btn btn-ghost btn-sm">Retry</button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {(!pcrItems || pcrItems.length === 0) && (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>No PCR reports uploaded yet.</p>
              )}
              {pcrItems?.map((r) => (
                <div key={r.id} className="flex items-start gap-2.5 rounded-xl border p-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                  <FileText size={18} style={{ color: 'var(--green)' }} className="flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{formatActivityTime(r.createdAt)}</p>
                    {r.note && <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{r.note}</p>}
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <p className="text-[11px]" style={{ color: 'var(--muted-2)' }}>
                        {fileTypeLabel(r.mimeType)} · {Math.round((r.fileSize / 1024) * 10) / 10} KB
                      </p>
                      <button onClick={() => onViewPcr(r)} disabled={viewingId === r.id} className="btn btn-sm btn-soft">
                        {viewingId === r.id ? <AppLoader size={17} /> : <Eye size={13} />}
                        View
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {canUploadPcr && (
                <button onClick={onUploadPcr} className="btn btn-soft btn-sm self-start">
                  <CloudUpload size={14} /> {pcrItems && pcrItems.length > 0 ? 'Upload another PCR' : 'Upload PCR'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { addNotification } = useNotificationStore();
  const [limit, setLimit] = useState(50);
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pcrCache, setPcrCache] = useState<Record<string, PatientCareReport[]>>({});
  const [pcrLoadingId, setPcrLoadingId] = useState<string | null>(null);
  const [pcrErrors, setPcrErrors] = useState<Record<string, string>>({});
  const [viewingId, setViewingId] = useState<string | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['operator', 'history', limit],
    queryFn: () => getTaskHistory(1, limit),
    placeholderData: (prev) => prev,
  });

  const history = data?.data ?? [];
  const total = data?.meta?.total ?? history.length;
  const isCrew = !!user && CREW.includes(user.role);
  const shown = history.filter((t) => matches(t, filter));
  const pcrDue = history.filter(needsPcr).length;

  // Cases grouped by the day they came in, newest first.
  const groups = useMemo(() => {
    const out: { label: string; items: TaskHistoryItem[] }[] = [];
    for (const t of shown) {
      const label = dayLabel(t.receivedAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(t);
      else out.push({ label, items: [t] });
    }
    return out;
  }, [shown]);

  const loadPcrs = async (taskId: string, force = false) => {
    if ((!force && pcrCache[taskId]) || pcrLoadingId === taskId) return;
    setPcrLoadingId(taskId);
    setPcrErrors((prev) => { const next = { ...prev }; delete next[taskId]; return next; });
    try {
      const reports = await getPatientCareReports(taskId);
      setPcrCache((prev) => ({ ...prev, [taskId]: reports }));
    } catch (err) {
      setPcrErrors((prev) => ({ ...prev, [taskId]: getErrorMessage(err) }));
    } finally {
      setPcrLoadingId(null);
    }
  };

  const toggleExpand = (item: TaskHistoryItem) => {
    const next = expandedId === item.id ? null : item.id;
    setExpandedId(next);
    if (next) loadPcrs(item.id);
  };

  const viewPcr = async (taskId: string, report: PatientCareReport) => {
    setViewingId(report.id);
    try {
      const url = await getPatientCareReportFileUrl(taskId, report.id);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      addNotification({ type: 'error', title: 'Could not open report', message: getErrorMessage(err) });
    } finally {
      setViewingId(null);
    }
  };

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'completed', label: 'Completed' },
    { id: 'cancelled', label: 'Cancelled' },
    { id: 'needsPcr', label: `Needs PCR${pcrDue ? ` · ${pcrDue}` : ''}` },
  ];

  return (
    <div className="col mx-auto w-full" style={{ gap: 20, maxWidth: 880 }}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Case log</p>
          <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>History</h2>
        </div>
        {total > 0 && <span className="pill pill-gray">{total} total</span>}
      </div>

      {isLoading ? (
        <LoadingState minHeight={200} />
      ) : error && history.length === 0 ? (
        <div className="card card-pad text-center">
          <p className="text-sm" style={{ color: 'var(--red)' }}>{getErrorMessage(error)}</p>
          <button onClick={() => refetch()} className="btn btn-primary btn-sm mt-3">Retry</button>
        </div>
      ) : history.length === 0 ? (
        <div className="card card-pad text-center" style={{ padding: 48 }}>
          <ClockIcon size={40} style={{ color: 'var(--muted-2)' }} className="mx-auto mb-4" />
          <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>No cases yet</p>
          <p className="text-sm mt-2 max-w-md mx-auto" style={{ color: 'var(--muted)' }}>
            When a case is completed or ended, it moves here with every stage time, the facility rating and PCR reports.
          </p>
        </div>
      ) : (
        <>
          <HistoryHero items={history} total={total} />

          <div className="seg" role="tablist" aria-label="Filter cases">
            {filters.map((f) => (
              <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <div className="card card-pad text-center">
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {filter === 'needsPcr' ? 'Every completed case has a PCR. Nice work.' : 'No cases match this filter.'}
              </p>
            </div>
          ) : groups.map((g) => (
            <section key={g.label} className="col" style={{ gap: 10 }}>
              <p className="label" style={{ color: g.label === 'Today' ? 'var(--gold)' : undefined }}>
                {g.label} · {g.items.length} case{g.items.length === 1 ? '' : 's'}
              </p>
              {g.items.map((item) => (
                <CaseCard
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() => toggleExpand(item)}
                  isCrew={isCrew}
                  myId={user?.id}
                  onUploadPcr={() => navigate(pcrPath(item.id, item.incident.caseNumber))}
                  onRate={(mine) => navigate(ratingPath(item.id, {
                    caseNumber: item.incident.caseNumber,
                    facility: item.incident.targetFacility?.name ?? 'the facility',
                    next: 'history',
                    stars: mine?.stars,
                  }))}
                  pcrItems={pcrCache[item.id] ?? null}
                  isPcrLoading={pcrLoadingId === item.id}
                  pcrError={pcrErrors[item.id] ?? null}
                  onRetryPcr={() => loadPcrs(item.id, true)}
                  onViewPcr={(r) => viewPcr(item.id, r)}
                  viewingId={viewingId}
                />
              ))}
            </section>
          ))}

          {history.length < total ? (
            <button onClick={() => setLimit((l) => l + 50)} disabled={isFetching} className="btn btn-soft self-center">
              {isFetching ? <AppLoader size={18} /> : 'Load older cases'}
            </button>
          ) : (
            <p className="text-center text-[11px] font-bold tracking-widest" style={{ color: 'var(--muted-2)' }}>START OF YOUR LOG</p>
          )}
        </>
      )}
    </div>
  );
}

export default HistoryPage;
