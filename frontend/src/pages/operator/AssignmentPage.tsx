import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RotateCcw as RefreshIcon, MapPin, Navigation as NavigationIcon, Phone, Users, FileText,
  ArrowRight, XCircle, ArrowLeftRight, Ambulance, ShieldAlert, Hospital, ChevronRight, Truck,
} from 'lucide-react';
import AppLoader from '@/components/shared/AppLoader';
import { getActiveTask, getMyCheckIn, updateTaskStatus, closeIncident, getErrorMessage } from '@/api/responder';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { socket } from '@/lib/socket';
import StatusBadge from '@/components/operator/StatusBadge';
import EndCaseModal from '@/components/operator/EndCaseModal';
import { ACTION_LABELS, STATUS_LABELS, getNextStatus } from '@/utils/taskStatus';
import { inAppNavigateUrl } from '@/utils/navigateUrl';
import type { PatientVitals, MaternityVitals } from '@/types/api';
import LoadingState from '@/components/shared/LoadingState';
import { CaseProgress, JourneyCard } from '@/components/operator/CaseJourney';
import TaskStopsCard from '@/components/operator/TaskStopsCard';
import { afterCompletePath, formatKm, hospitalRouteUrl, pcrPath } from '@/utils/caseFlow';

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
    // Same follow-ups as the app's case screen after each step is saved.
    onSuccess: async (_updated, status) => {
      if (status === 'COMPLETED') {
        addNotification({ type: 'success', title: 'Case completed', message: 'Rate the facility, then file the PCR.' });
        queryClient.invalidateQueries({ queryKey: ['operator', 'active-task'] });
        navigate(afterCompletePath(task!));
        return;
      }
      const fresh = await queryClient.fetchQuery({ queryKey: ['operator', 'active-task'], queryFn: getActiveTask, staleTime: 0 });
      if (status === 'ACCEPTED') {
        const km = fresh?.distanceToSceneKm;
        const away = km != null ? ` · ${formatKm(km)} away` : '';
        addNotification(
          collectsFromAmbulance
            ? { type: 'success', title: 'Transfer accepted', message: `Collect the patient from ${firstStopName}${away}.` }
            : { type: 'success', title: 'Call accepted', message: km != null ? `The scene is ${formatKm(km)} away.` : 'Head to the scene.' },
        );
        if (inAppMapsUrl) navigate(inAppMapsUrl);
      } else if (status === 'PATIENT_PICKED') {
        const km = fresh?.sceneToFacilityKm;
        const facility = fresh?.incident.targetFacility?.name ?? 'The facility';
        addNotification({
          type: 'success', title: 'Patient on board',
          message: km != null ? `${facility} is ${formatKm(km)} from the scene.` : ACTION_LABELS[task!.status] ?? '',
        });
      } else if (status === 'EN_ROUTE_TO_FACILITY') {
        const f = fresh?.incident.targetFacility;
        const km = fresh?.sceneToFacilityKm;
        addNotification({ type: 'success', title: 'Leaving for the hospital', message: f ? `On the way to ${f.name}${km != null ? ` · ${formatKm(km)}` : ''}.` : '' });
        const url = fresh ? hospitalRouteUrl(fresh) : null;
        if (url) navigate(url);
      } else {
        addNotification({ type: 'success', title: 'Status updated', message: ACTION_LABELS[task!.status] ?? '' });
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
        navigate(pcrPath(task!.id, task!.incident.caseNumber));
      } else {
        navigate('/operator/history');
      }
    },
    onError: (err) => addNotification({ type: 'error', title: 'Could not end case', message: getErrorMessage(err) }),
  });

  const nextStatus = task ? getNextStatus(task.status) : null;
  const transferredFrom = task?.previousTask ?? null;
  // A transfer with the patient already on board: the crew collects them from
  // the broken-down ambulance, not the scene (same as the app).
  const collectsFromAmbulance = task?.pickupLat != null && task?.pickupLng != null;
  const firstStopName = collectsFromAmbulance ? (task?.pickupName ?? 'the other ambulance') : (task?.incident.locationName ?? '');
  const destLat = collectsFromAmbulance ? task!.pickupLat : task?.incident.lat;
  const destLng = collectsFromAmbulance ? task!.pickupLng : task?.incident.lng;
  const actionLabel = task
    ? task.status === 'PENDING' && transferredFrom ? 'Accept transfer' : ACTION_LABELS[task.status]
    : null;
  // Every crew member gets the in-app map (see NavigatePage), as in the app.
  const inAppMapsUrl = task ? inAppNavigateUrl(destLat, destLng, firstStopName) : null;
  const afterPickup = !!task && ['PATIENT_PICKED', 'EN_ROUTE_TO_FACILITY', 'AT_HOSPITAL'].includes(task.status);
  const hospitalUrl = task && afterPickup ? hospitalRouteUrl(task) : null;

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Field Operations</p>
          <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Assignment</h2>
        </div>
        <button onClick={() => refetch()} className="icon-btn" title="Refresh">
          {isFetching ? <AppLoader size={18} color="var(--green)" /> : <RefreshIcon size={18} />}
        </button>
      </div>

      {isLoading ? (
        <LoadingState minHeight={220} />
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
          <CaseProgress task={task} />
          <div className="card card-pad">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xl font-bold" style={{ color: 'var(--ink)' }}>{task.incident.caseNumber}</p>
              <StatusBadge status={task.status} />
            </div>

            {transferredFrom && (
              <div className="flex gap-2.5 rounded-xl p-3 mb-3" style={{ background: 'var(--amber-soft)' }}>
                <ArrowLeftRight size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--amber)' }} />
                <div className="min-w-0">
                  <p className="text-sm font-bold" style={{ color: 'var(--amber)' }}>
                    Transferred from {transferredFrom.vehicle?.registrationNumber ?? 'another ambulance'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>
                    {[
                      transferredFrom.handoverReason,
                      transferredFrom.handoverStage ? `at "${STATUS_LABELS[transferredFrom.handoverStage].toLowerCase()}"` : null,
                      collectsFromAmbulance ? 'Collect the patient from that ambulance' : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            )}

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
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                  {collectsFromAmbulance ? `Collect the patient from ${firstStopName}` : task.incident.locationName}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  {task.incident.subCounty}{task.incident.placeOfReferral ? ` · Referral: ${task.incident.placeOfReferral}` : ''}
                </p>
              </div>
              {inAppMapsUrl && (
                <button onClick={() => navigate(inAppMapsUrl)} className="icon-btn flex-shrink-0" title="Route to the scene">
                  <NavigationIcon size={16} />
                </button>
              )}
            </div>

            {/* After pickup the next leg starts at the scene. */}
            {hospitalUrl && (
              <button
                onClick={() => navigate(hospitalUrl)}
                className="w-full flex items-center gap-3 rounded-xl p-3.5 mb-3 text-left"
                style={{ background: 'var(--green-light)' }}
              >
                <Hospital size={18} style={{ color: 'var(--green)' }} className="flex-shrink-0" />
                <span className="flex-1 min-w-0 text-sm font-bold" style={{ color: 'var(--green)' }}>
                  Route to {task.incident.targetFacility?.name}
                </span>
                <ChevronRight size={16} style={{ color: 'var(--green)' }} />
              </button>
            )}

            <div className="flex items-center gap-2 mb-2.5 text-sm" style={{ color: 'var(--muted)' }}>
              <Truck size={15} /> <span className="mono font-semibold" style={{ color: 'var(--ink)' }}>{task.vehicle.registrationNumber}</span>
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

          <JourneyCard task={task} />
          <TaskStopsCard taskId={task.id} isActive={task.status !== 'COMPLETED' && task.status !== 'CANCELLED'} />

          <button onClick={() => navigate(`/operator/tasks/${task.id}/patient-data`)} className="btn btn-soft btn-block">
            <FileText size={18} /> Patient / Clinical Notes
          </button>

          {/* Pinned so the next step is always one tap away mid-call (as in the app). */}
          <div className="case-actions">
          {nextStatus && actionLabel && (
            <button
              onClick={() => statusMutation.mutate(nextStatus)}
              disabled={statusMutation.isPending}
              className="btn btn-primary btn-lg btn-block"
            >
              {statusMutation.isPending ? <AppLoader size={22} /> : <ArrowRight size={18} />}
              {actionLabel}
            </button>
          )}

          {user?.role === 'DRIVER' && (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => navigate(`/operator/tasks/${task.id}/transfer`)} className="btn btn-ghost" style={{ height: 46, border: '1px solid var(--border-strong)' }}>
                <ArrowLeftRight size={18} /> Handover
              </button>
              <button
                onClick={() => setShowEndCase(true)}
                className="btn"
                style={{ height: 46, border: '1.5px solid var(--red)', color: 'var(--red)', background: 'transparent' }}
              >
                <XCircle size={18} /> End case
              </button>
            </div>
          )}
          </div>
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

    </div>
  );
}

export default AssignmentPage;
