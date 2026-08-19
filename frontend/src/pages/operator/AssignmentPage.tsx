import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RotateCcw as RefreshIcon, MapPin, Navigation as NavigationIcon, Phone, Users, FileText,
  ArrowRight, XCircle, ArrowLeftRight, Ambulance, ShieldAlert, LoaderCircle,
} from 'lucide-react';
import { getActiveTask, getMyCheckIn, updateTaskStatus, closeIncident, handoverTask, getErrorMessage } from '@/api/responder';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { socket } from '@/lib/socket';
import StatusBadge from '@/components/operator/StatusBadge';
import EndCaseModal from '@/components/operator/EndCaseModal';
import HandoverModal from '@/components/operator/HandoverModal';
import { ACTION_LABELS, getNextStatus } from '@/utils/taskStatus';
import { inAppNavigateUrl } from '@/utils/navigateUrl';
import type { PatientVitals, MaternityVitals } from '@/types/api';

function hasAnyVitals(v?: PatientVitals | null): boolean {
  if (!v) return false;
  return Boolean(v.temperature || v.pulseRate || v.respirationRate || v.bp || v.spo2 || v.fh);
}

function hasMaternityVitals(v?: MaternityVitals | null): boolean {
  if (!v) return false;
  return Object.values(v).some((val) => Boolean(val && String(val).trim()));
}

function VitalChip({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="rounded-lg border px-2.5 py-2 flex-1 min-w-[30%]" style={{ borderColor: 'var(--border)' }}>
      <p className="text-[11px]" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--ink)' }}>{value}</p>
    </div>
  );
}

function AssignmentPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();
  const [showEndCase, setShowEndCase] = useState(false);
  const [showHandover, setShowHandover] = useState(false);

  const { data: task, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['operator', 'active-task'],
    queryFn: getActiveTask,
    refetchInterval: 20000,
  });
  const { data: myVehicle } = useQuery({ queryKey: ['operator', 'my-checkin'], queryFn: getMyCheckIn });

  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['operator', 'active-task'] });
    socket.on('task:assigned', refresh);
    socket.on('task:updated', refresh);
    return () => {
      socket.off('task:assigned', refresh);
      socket.off('task:updated', refresh);
    };
  }, [queryClient]);

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateTaskStatus(task!.id, status as any),
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ['operator', 'active-task'] });
      addNotification({ type: 'success', title: 'Status updated', message: ACTION_LABELS[task!.status] ?? '' });
      if (status === 'COMPLETED') {
        navigate(`/operator/tasks/${task!.id}/patient-care-report?caseNumber=${encodeURIComponent(task!.incident.caseNumber)}`);
      }
    },
    onError: (err) => addNotification({ type: 'error', title: 'Update failed', message: getErrorMessage(err) }),
  });

  const endCaseMutation = useMutation({
    mutationFn: (reason: string) => closeIncident(task!.incidentId, reason),
    onSuccess: () => {
      setShowEndCase(false);
      queryClient.invalidateQueries({ queryKey: ['operator', 'active-task'] });
      addNotification({ type: 'success', title: 'Case ended', message: 'Saved to History with stage timestamps.' });
      if (user?.role === 'DRIVER') {
        navigate(`/operator/tasks/${task!.id}/patient-care-report?caseNumber=${encodeURIComponent(task!.incident.caseNumber)}`);
      } else {
        navigate('/operator/history');
      }
    },
    onError: (err) => addNotification({ type: 'error', title: 'Could not end case', message: getErrorMessage(err) }),
  });

  const handoverMutation = useMutation({
    mutationFn: (payload: { reason: string; autoAssign: boolean; newVehicleId?: string }) => handoverTask(task!.id, payload),
    onSuccess: (result) => {
      setShowHandover(false);
      queryClient.invalidateQueries({ queryKey: ['operator', 'active-task'] });
      queryClient.invalidateQueries({ queryKey: ['operator', 'my-checkin'] });
      const receiver = result.newTask?.vehicle?.registrationNumber;
      addNotification({
        type: 'success',
        title: 'Case transferred',
        message: receiver ? `Passed to ${receiver}. You're checked out — the case stays open for them.` : "Case returned to dispatch. You're checked out.",
      });
    },
    onError: (err) => addNotification({ type: 'error', title: 'Couldn’t transfer the case', message: getErrorMessage(err) }),
  });

  const nextStatus = task ? getNextStatus(task.status) : null;
  const actionLabel = task ? ACTION_LABELS[task.status] : null;
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
          <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Assignment</h2>
        </div>
        <button onClick={() => refetch()} className="icon-btn" title="Refresh">
          <RefreshIcon size={18} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {isLoading ? (
        <div className="skel" style={{ height: 220 }} />
      ) : error ? (
        <div className="card card-pad text-center">
          <p className="text-sm" style={{ color: 'var(--red)' }}>{getErrorMessage(error)}</p>
          <button onClick={() => refetch()} className="btn btn-primary btn-sm mt-3">Retry</button>
        </div>
      ) : !task ? (
        <>
          {!myVehicle && (
            <div className="card card-pad flex gap-2.5" style={{ background: 'var(--surface-2)' }}>
              <ShieldAlert size={20} style={{ color: 'var(--green)' }} className="flex-shrink-0" />
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Check in to your vehicle on the Crew page before dispatch can assign cases to you.
              </p>
            </div>
          )}
          <div className="card card-pad text-center" style={{ padding: 48 }}>
            <Ambulance size={48} style={{ color: 'var(--muted-2)' }} className="mx-auto mb-4" />
            <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>No active assignment</p>
            <p className="text-sm mt-2 max-w-md mx-auto" style={{ color: 'var(--muted)' }}>
              {myVehicle
                ? 'You are on shift. You will be notified when dispatch assigns a case to your crew.'
                : 'You will be notified when dispatch assigns a case to your crew.'}
            </p>
            <button onClick={() => refetch()} className="btn btn-soft btn-sm mt-4">Refresh now</button>
          </div>
        </>
      ) : (
        <>
          <div className="card card-pad">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xl font-bold" style={{ color: 'var(--ink)' }}>{task.incident.caseNumber}</p>
              <StatusBadge status={task.status} />
            </div>

            {(task.incident.alertNature || task.incident.isGbvCase || task.incident.massCasualty) && (
              <div className="flex flex-wrap gap-2 mb-3">
                {task.incident.isGbvCase && <span className="pill pill-red">GBV case</span>}
                {task.incident.massCasualty && (
                  <span className="pill pill-gray">Mass casualty{task.incident.massCasualtyCount ? ` · ${task.incident.massCasualtyCount}` : ''}</span>
                )}
                {task.incident.alertNature && (
                  <span className="pill pill-gray">
                    {task.incident.alertNature}{task.incident.alertNatureDetail ? ` · ${task.incident.alertNatureDetail}` : ''}
                  </span>
                )}
              </div>
            )}

            <p className="text-base mb-4" style={{ color: 'var(--ink-2)' }}>{task.incident.chiefComplaint}</p>

            <div className="flex items-center gap-3 rounded-xl p-3.5 mb-3" style={{ background: 'var(--surface-2)' }}>
              <MapPin size={18} style={{ color: 'var(--green)' }} className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{task.incident.locationName}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  {task.incident.subCounty}{task.incident.placeOfReferral ? ` · Referral: ${task.incident.placeOfReferral}` : ''}
                </p>
              </div>
              {user?.role === 'DRIVER' && inAppMapsUrl ? (
                <button onClick={() => navigate(inAppMapsUrl)} className="icon-btn flex-shrink-0" title="Navigate">
                  <NavigationIcon size={16} />
                </button>
              ) : externalMapsUrl && (
                <a href={externalMapsUrl} target="_blank" rel="noreferrer" className="icon-btn flex-shrink-0" title="Open in Google Maps">
                  <NavigationIcon size={16} />
                </a>
              )}
            </div>

            {task.incident.patientName && (
              <div className="flex items-center gap-2 mb-2.5 text-sm" style={{ color: 'var(--muted)' }}>
                <Users size={15} />
                {task.incident.patientName}
                {task.incident.patientAge ? `, ${task.incident.patientAge}` : ''}
                {task.incident.patientGender ? ` · ${task.incident.patientGender}` : ''}
              </div>
            )}

            {task.incident.patientContact && (
              <a href={`tel:${task.incident.patientContact}`} className="flex items-center gap-2 mb-2.5 text-sm" style={{ color: 'var(--muted)' }}>
                <Phone size={15} /> Patient · {task.incident.patientContact}
              </a>
            )}

            {(task.incident.nextOfKin || task.incident.nextOfKinPhone) && (
              <a
                href={task.incident.nextOfKinPhone ? `tel:${task.incident.nextOfKinPhone}` : undefined}
                className="flex items-center gap-2 mb-2.5 text-sm"
                style={{ color: 'var(--muted)' }}
              >
                <Users size={15} />
                Next of kin{task.incident.nextOfKin ? ` · ${task.incident.nextOfKin}` : ''}{task.incident.nextOfKinPhone ? ` · ${task.incident.nextOfKinPhone}` : ''}
              </a>
            )}

            {hasAnyVitals(task.incident.vitals) && (
              <div className="rounded-xl p-3.5 mt-2" style={{ background: 'var(--surface-2)' }}>
                <p className="label mb-2">Patient vitals</p>
                <div className="flex flex-wrap gap-2">
                  <VitalChip label="Temp" value={task.incident.vitals?.temperature} />
                  <VitalChip label="Pulse" value={task.incident.vitals?.pulseRate} />
                  <VitalChip label="RR" value={task.incident.vitals?.respirationRate} />
                  <VitalChip label="BP" value={task.incident.vitals?.bp} />
                  <VitalChip label="SPO₂" value={task.incident.vitals?.spo2} />
                  <VitalChip label="FH" value={task.incident.vitals?.fh} />
                </div>
              </div>
            )}

            {hasMaternityVitals(task.incident.maternityVitals) && (
              <div className="rounded-xl p-3.5 mt-2" style={{ background: 'var(--surface-2)' }}>
                <p className="label mb-2">Maternity vitals</p>
                <div className="flex flex-wrap gap-2">
                  <VitalChip label="Parity" value={task.incident.maternityVitals?.parity} />
                  <VitalChip label="Gravid" value={task.incident.maternityVitals?.gravid} />
                  <VitalChip label="FHR" value={task.incident.maternityVitals?.fetalHeartRate} />
                  <VitalChip label="Dilatation" value={task.incident.maternityVitals?.cervicalDilatation} />
                  <VitalChip label="BP" value={task.incident.maternityVitals?.bp} />
                  <VitalChip label="Pulse" value={task.incident.maternityVitals?.pulse} />
                  <VitalChip label="Temp" value={task.incident.maternityVitals?.temperature} />
                  <VitalChip label="SPO₂" value={task.incident.maternityVitals?.spo2} />
                </div>
              </div>
            )}

            {task.incident.dispatcherComments && (
              <div className="rounded-xl p-3.5 mt-2" style={{ background: 'var(--surface-2)' }}>
                <p className="label mb-1">Dispatcher notes</p>
                <p className="text-sm" style={{ color: 'var(--ink-2)' }}>{task.incident.dispatcherComments}</p>
              </div>
            )}
          </div>

          {nextStatus && actionLabel && (
            <button
              onClick={() => statusMutation.mutate(nextStatus)}
              disabled={statusMutation.isPending}
              className="btn btn-primary btn-lg btn-block"
            >
              {statusMutation.isPending ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              {actionLabel}
            </button>
          )}

          <button onClick={() => navigate(`/operator/tasks/${task.id}/patient-data`)} className="btn btn-soft btn-block">
            <FileText size={18} /> Patient / Clinical Notes
          </button>

          {user?.role === 'DRIVER' && (
            <button
              onClick={() => setShowEndCase(true)}
              disabled={handoverMutation.isPending}
              className="btn btn-block"
              style={{ border: '1.5px solid var(--red)', color: 'var(--red)', background: 'var(--red-soft)' }}
            >
              <XCircle size={18} /> End case (any stage)
            </button>
          )}

          {user?.role === 'DRIVER' && (
            <button onClick={() => setShowHandover(true)} disabled={handoverMutation.isPending} className="btn btn-soft btn-block">
              <ArrowLeftRight size={18} /> Transfer case to nearby unit
            </button>
          )}
        </>
      )}

      {task && showEndCase && (
        <EndCaseModal
          caseNumber={task.incident.caseNumber}
          isSubmitting={endCaseMutation.isPending}
          onClose={() => setShowEndCase(false)}
          onConfirm={(reason) => endCaseMutation.mutate(reason)}
        />
      )}

      {task && showHandover && (
        <HandoverModal
          caseNumber={task.incident.caseNumber}
          currentVehicleId={task.vehicleId}
          referenceLat={myVehicle?.lastLat ?? task.incident.lat}
          referenceLng={myVehicle?.lastLng ?? task.incident.lng}
          isSubmitting={handoverMutation.isPending}
          onClose={() => setShowHandover(false)}
          onConfirm={(payload) => handoverMutation.mutate(payload)}
        />
      )}
    </div>
  );
}

export default AssignmentPage;
