import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ambulance, MapPin, Navigation as NavigationIcon, Users,
  History as HistoryIcon, ArrowRight, CircleCheck as CheckCircle, UserCog, Package,
} from 'lucide-react';
import { getActiveTask, getMyCheckIn, getTaskHistory } from '@/api/responder';
import { useAuthStore } from '@/stores/authStore';
import { socket } from '@/lib/socket';
import ShiftCheckInCard from '@/components/operator/ShiftCheckInCard';
import StatusBadge from '@/components/operator/StatusBadge';
import { inAppNavigateUrl } from '@/utils/navigateUrl';

function DriverDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const { data: task, isLoading: taskLoading } = useQuery({
    queryKey: ['operator', 'active-task'],
    queryFn: getActiveTask,
    refetchInterval: 20000,
  });
  const { data: myVehicle } = useQuery({ queryKey: ['operator', 'my-checkin'], queryFn: getMyCheckIn });
  // A generous limit keeps "completed today" accurate for a normal shift's
  // case volume without pulling the driver's entire history.
  const { data: recentHistory } = useQuery({
    queryKey: ['operator', 'history', 'recent'],
    queryFn: () => getTaskHistory(1, 30),
  });

  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['operator', 'active-task'] });
      queryClient.invalidateQueries({ queryKey: ['operator', 'my-checkin'] });
    };
    socket.on('task:assigned', refresh);
    socket.on('task:updated', refresh);
    return () => {
      socket.off('task:assigned', refresh);
      socket.off('task:updated', refresh);
    };
  }, [queryClient]);

  const completedToday = (recentHistory?.data ?? []).filter((item) => {
    if (item.status !== 'COMPLETED') return false;
    const endedAt = item.completedAt ?? item.cancelledAt ?? item.receivedAt;
    return endedAt && new Date(endedAt).toDateString() === new Date().toDateString();
  }).length;

  // Always DRIVER on this page, so the in-app map is the only option here.
  const inAppMapsUrl = task ? inAppNavigateUrl(task.incident.lat, task.incident.lng, task.incident.locationName) : null;

  return (
    <div className="col" style={{ gap: 20 }}>
      <div>
        <p className="eyebrow">Field Operations</p>
        <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>
          {user?.name ? `Welcome, ${user.name.split(' ')[0]}` : 'Driver Dashboard'}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Your shift, assignment &amp; quick actions</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card card-pad">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: myVehicle ? 'var(--green-light)' : 'var(--surface-2)' }}
            >
              <Ambulance size={18} color={myVehicle ? 'var(--green)' : 'var(--muted)'} />
            </div>
            <div>
              <p className="eyebrow">Shift</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--ink)' }}>{myVehicle ? 'On duty' : 'Off duty'}</p>
            </div>
          </div>
        </div>
        <div className="card card-pad">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--blue-soft)' }}>
              <CheckCircle size={18} color="var(--blue)" />
            </div>
            <div>
              <p className="eyebrow">Completed today</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--ink)' }}>{completedToday}</p>
            </div>
          </div>
        </div>
      </div>

      <ShiftCheckInCard />

      {/* Active assignment summary */}
      {taskLoading ? (
        <div className="skel" style={{ height: 140 }} />
      ) : task ? (
        <button onClick={() => navigate('/operator/assignment')} className="card card-pad text-left w-full">
          <div className="flex items-center justify-between mb-2">
            <p className="label">Active assignment</p>
            <StatusBadge status={task.status} />
          </div>
          <p className="text-xl font-bold" style={{ color: 'var(--ink)' }}>{task.incident.caseNumber}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-2)' }}>{task.incident.chiefComplaint}</p>
          <div className="flex items-center gap-2 mt-3 text-sm" style={{ color: 'var(--muted)' }}>
            <MapPin size={15} /> {task.incident.locationName}
          </div>
          <div className="flex items-center justify-between mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <span className="text-sm font-bold" style={{ color: 'var(--green)' }}>View assignment</span>
            <ArrowRight size={16} style={{ color: 'var(--green)' }} />
          </div>
        </button>
      ) : (
        <div className="card card-pad text-center" style={{ padding: 36 }}>
          <Ambulance size={36} style={{ color: 'var(--muted-2)' }} className="mx-auto mb-3" />
          <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>No active assignment</p>
          <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>
            {myVehicle
              ? 'You are on shift. Dispatch will notify you when a case comes in.'
              : 'Check in to a vehicle above to start receiving cases.'}
          </p>
        </div>
      )}

      {/* Quick links */}
      <div>
        <p className="label mb-2">Quick links</p>
        <div className="col" style={{ gap: 8 }}>
          <button onClick={() => navigate('/operator/crew')} className="card card-pad flex items-center gap-3 w-full text-left">
            <Users size={18} style={{ color: 'var(--green)' }} />
            <span className="text-sm font-bold flex-1" style={{ color: 'var(--ink)' }}>Crew &amp; check-in</span>
            <ArrowRight size={16} style={{ color: 'var(--muted)' }} />
          </button>
          <button onClick={() => navigate('/operator/history')} className="card card-pad flex items-center gap-3 w-full text-left">
            <HistoryIcon size={18} style={{ color: 'var(--green)' }} />
            <span className="text-sm font-bold flex-1" style={{ color: 'var(--ink)' }}>Assignment history</span>
            <ArrowRight size={16} style={{ color: 'var(--muted)' }} />
          </button>
          <button onClick={() => navigate('/operator/inventory')} className="card card-pad flex items-center gap-3 w-full text-left">
            <Package size={18} style={{ color: 'var(--green)' }} />
            <span className="text-sm font-bold flex-1" style={{ color: 'var(--ink)' }}>Inventory</span>
            <ArrowRight size={16} style={{ color: 'var(--muted)' }} />
          </button>
          {/* This tab now fills the 6th "Field Operations" nav slot, which pushes
              My Profile off the mobile bottom nav (only the first 5 show) - so it
              gets a quick link here instead. */}
          <button onClick={() => navigate('/profile')} className="card card-pad flex items-center gap-3 w-full text-left">
            <UserCog size={18} style={{ color: 'var(--green)' }} />
            <span className="text-sm font-bold flex-1" style={{ color: 'var(--ink)' }}>My profile</span>
            <ArrowRight size={16} style={{ color: 'var(--muted)' }} />
          </button>
          {inAppMapsUrl && (
            <button onClick={() => navigate(inAppMapsUrl)} className="card card-pad flex items-center gap-3 w-full text-left">
              <NavigationIcon size={18} style={{ color: 'var(--green)' }} />
              <span className="text-sm font-bold flex-1" style={{ color: 'var(--ink)' }}>Navigate to current scene</span>
              <ArrowRight size={16} style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DriverDashboardPage;
