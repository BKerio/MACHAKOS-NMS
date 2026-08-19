import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown, ChevronUp, Clock as ClockIcon, CloudUpload, FileText, Eye, LoaderCircle,
} from 'lucide-react';
import { getTaskHistory, getPatientCareReports, getPatientCareReportFileUrl, getErrorMessage } from '@/api/responder';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import StatusBadge from '@/components/operator/StatusBadge';
import ActivityTimeline from '@/components/operator/ActivityTimeline';
import { buildTaskActivities, formatActivityTime } from '@/utils/taskActivities';
import type { PatientCareReport, TaskHistoryItem } from '@/types/api';

function fileTypeLabel(mimeType: string) {
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'DOCX';
  return 'File';
}

function AssignmentCard({
  item,
  expanded,
  onToggle,
  canUploadPcr,
  onUploadPcr,
  pcrItems,
  isPcrLoading,
  pcrError,
  onViewPcr,
  viewingId,
}: {
  item: TaskHistoryItem;
  expanded: boolean;
  onToggle: () => void;
  canUploadPcr: boolean;
  onUploadPcr: () => void;
  pcrItems: PatientCareReport[] | null;
  isPcrLoading: boolean;
  pcrError: string | null;
  onViewPcr: (r: PatientCareReport) => void;
  viewingId: string | null;
}) {
  const endedAt = item.completedAt ?? item.cancelledAt ?? item.receivedAt;
  const pcrCount = item.pcrCount ?? 0;
  const activities = useMemo(() => buildTaskActivities(item, { live: false }), [item]);

  return (
    <div className="card card-pad">
      <button onClick={onToggle} className="w-full flex items-start gap-2.5 text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>{item.incident.caseNumber}</p>
            <StatusBadge status={item.status} />
          </div>
          <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>{item.incident.chiefComplaint}</p>
          <p className="text-xs mt-1.5" style={{ color: 'var(--muted-2)' }}>
            {item.vehicle.registrationNumber} · {item.incident.locationName}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-2)' }}>
            {formatActivityTime(endedAt)}
            {pcrCount > 0 ? ` · ${pcrCount} PCR` : ''}
            {activities.filter((a) => a.timestamp).length > 0 ? ` · ${activities.filter((a) => a.timestamp).length} stages` : ''}
          </p>
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
          {item.status === 'HANDED_OVER' && item.handoverReason && (
            <p className="text-sm mt-2" style={{ color: 'var(--green)' }}>Transferred: {item.handoverReason}</p>
          )}

          <p className="label mt-5 mb-3">PCR reports</p>
          {isPcrLoading ? (
            <LoaderCircle size={18} className="animate-spin" style={{ color: 'var(--green)' }} />
          ) : pcrError ? (
            <p className="text-sm" style={{ color: 'var(--red)' }}>{pcrError}</p>
          ) : !pcrItems || pcrItems.length === 0 ? (
            <div className="flex flex-col items-start gap-2.5">
              <p className="text-sm" style={{ color: 'var(--muted)' }}>No PCR reports uploaded yet.</p>
              {canUploadPcr && (
                <button onClick={onUploadPcr} className="btn btn-soft btn-sm">
                  <CloudUpload size={14} /> Upload PCR
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {pcrItems.map((r) => (
                <div key={r.id} className="flex items-start gap-2.5 rounded-xl border p-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                  <FileText size={18} style={{ color: 'var(--green)' }} className="flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{formatActivityTime(r.createdAt)}</p>
                    {r.note && <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{r.note}</p>}
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-[11px]" style={{ color: 'var(--muted-2)' }}>
                        {fileTypeLabel(r.mimeType)} · {Math.round((r.fileSize / 1024) * 10) / 10} KB
                      </p>
                      <button onClick={() => onViewPcr(r)} disabled={viewingId === r.id} className="btn btn-sm btn-soft">
                        {viewingId === r.id ? <LoaderCircle size={13} className="animate-spin" /> : <Eye size={13} />}
                        View
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {canUploadPcr && (
                <button onClick={onUploadPcr} className="btn btn-soft btn-sm self-start">
                  <CloudUpload size={14} /> Upload another PCR
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
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pcrCache, setPcrCache] = useState<Record<string, PatientCareReport[]>>({});
  const [pcrLoadingId, setPcrLoadingId] = useState<string | null>(null);
  const [pcrErrors, setPcrErrors] = useState<Record<string, string>>({});
  const [viewingId, setViewingId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['operator', 'history', page],
    queryFn: () => getTaskHistory(page, 15),
  });

  const history = data?.data ?? [];
  const meta = data?.meta;

  const loadPcrs = async (taskId: string) => {
    if (pcrCache[taskId] || pcrLoadingId === taskId) return;
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

  return (
    <div className="col" style={{ gap: 20 }}>
      <div>
        <p className="eyebrow">Field Operations</p>
        <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>History</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Ended cases with stages, times &amp; PCR</p>
      </div>

      {isLoading ? (
        <div className="skel" style={{ height: 200 }} />
      ) : error ? (
        <div className="card card-pad text-center">
          <p className="text-sm" style={{ color: 'var(--red)' }}>{getErrorMessage(error)}</p>
          <button onClick={() => refetch()} className="btn btn-primary btn-sm mt-3">Retry</button>
        </div>
      ) : history.length === 0 ? (
        <div className="card card-pad text-center" style={{ padding: 48 }}>
          <ClockIcon size={40} style={{ color: 'var(--muted-2)' }} className="mx-auto mb-4" />
          <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>No assignment history</p>
          <p className="text-sm mt-2 max-w-md mx-auto" style={{ color: 'var(--muted)' }}>
            When a case is completed or ended, it moves here with every stage timestamp and PCR reports.
          </p>
        </div>
      ) : (
        <>
          <p className="label">Ended cases{meta ? ` · ${meta.total}` : ''}</p>
          {history.map((item) => (
            <AssignmentCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => toggleExpand(item)}
              canUploadPcr={!!user && user.role === 'DRIVER' && item.status === 'COMPLETED'}
              onUploadPcr={() => navigate(`/operator/tasks/${item.id}/patient-care-report?caseNumber=${encodeURIComponent(item.incident.caseNumber)}`)}
              pcrItems={pcrCache[item.id] ?? null}
              isPcrLoading={pcrLoadingId === item.id}
              pcrError={pcrErrors[item.id] ?? null}
              onViewPcr={(r) => viewPcr(item.id, r)}
              viewingId={viewingId}
            />
          ))}
          {meta && page < meta.totalPages && (
            <button onClick={() => setPage((p) => p + 1)} className="btn btn-soft self-center">
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default HistoryPage;
