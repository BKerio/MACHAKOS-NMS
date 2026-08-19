import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw as RefreshIcon, MapPin, Clock, Navigation as NavigationIcon, Hospital, History as HistoryIcon } from 'lucide-react';
import { getActiveTask, getErrorMessage } from '@/api/responder';
import { useAuthStore } from '@/stores/authStore';
import StatusBadge from '@/components/operator/StatusBadge';
import ActivityTimeline from '@/components/operator/ActivityTimeline';
import { buildTaskActivities, formatActivityTime } from '@/utils/taskActivities';
import { inAppNavigateUrl } from '@/utils/navigateUrl';

function ActivityPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { data: task, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['operator', 'active-task'],
    queryFn: getActiveTask,
    refetchInterval: 20000,
  });

  const activities = useMemo(() => (task ? buildTaskActivities(task, { live: true }) : []), [task]);

  // Drivers get the in-app map (see NavigatePage); other crew still open Google Maps.
  const inAppMapsUrl = task ? inAppNavigateUrl(task.incident.lat, task.incident.lng, task.incident.locationName) : null;
  const externalMapsUrl = task?.incident.lat != null && task?.incident.lng != null
    ? `https://maps.google.com/?q=${task.incident.lat},${task.incident.lng}`
    : null;

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Field Operations</p>
          <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Activity</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Live stages for your assigned case</p>
        </div>
        <button
          onClick={() => { refetch(); queryClient.invalidateQueries({ queryKey: ['operator', 'active-task'] }); }}
          className="icon-btn"
          title="Refresh"
        >
          <RefreshIcon size={18} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {isLoading ? (
        <div className="skel" style={{ height: 200 }} />
      ) : error && !task ? (
        <div className="card card-pad text-center">
          <p className="text-sm" style={{ color: 'var(--red)' }}>{getErrorMessage(error)}</p>
          <button onClick={() => refetch()} className="btn btn-primary btn-sm mt-3">Retry</button>
        </div>
      ) : !task ? (
        <div className="card card-pad text-center" style={{ padding: 48 }}>
          <HistoryIcon size={44} style={{ color: 'var(--muted-2)' }} className="mx-auto mb-4" />
          <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>No active case</p>
          <p className="text-sm mt-2 max-w-md mx-auto" style={{ color: 'var(--muted)' }}>
            When you are assigned a case, real-time stages and timestamps will appear here. Ended cases move to
            History.
          </p>
          <button onClick={() => navigate('/operator/history')} className="btn btn-soft btn-sm mt-4">View history</button>
        </div>
      ) : (
        <>
          <div className="card card-pad">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1">
                <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>{task.incident.caseNumber}</p>
                <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{task.incident.chiefComplaint}</p>
              </div>
              <StatusBadge status={task.status} />
            </div>

            <div className="flex items-center gap-2 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <MapPin size={15} style={{ color: 'var(--muted)' }} />
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {task.incident.locationName}{task.incident.subCounty ? ` · ${task.incident.subCounty}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Clock size={15} style={{ color: 'var(--muted)' }} />
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Assigned {formatActivityTime(task.receivedAt) ?? '—'}</p>
            </div>
            {task.incident.placeOfReferral && (
              <div className="flex items-center gap-2 mt-2">
                <Hospital size={15} style={{ color: 'var(--muted)' }} />
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Referral · {task.incident.placeOfReferral}</p>
              </div>
            )}

            {user?.role === 'DRIVER' && inAppMapsUrl ? (
              <button onClick={() => navigate(inAppMapsUrl)} className="btn btn-soft btn-sm mt-3.5">
                <NavigationIcon size={16} /> Open live map
              </button>
            ) : externalMapsUrl && (
              <a href={externalMapsUrl} target="_blank" rel="noreferrer" className="btn btn-soft btn-sm mt-3.5">
                <NavigationIcon size={16} /> Open live map
              </a>
            )}
          </div>

          <div className="card card-pad">
            <p className="label mb-3">Live stages</p>
            <ActivityTimeline activities={activities} />
          </div>

          <p className="text-xs px-1" style={{ color: 'var(--muted)' }}>
            Stages update in real time as the crew advances the case. When the case is ended or completed, it moves
            to History.
          </p>
        </>
      )}
    </div>
  );
}

export default ActivityPage;
