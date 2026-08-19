import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight as CaretRight,
  MapPin,
  Pencil as PencilSimple,
  Send as PaperPlaneRight,
  Printer,
  CircleArrowUp as ArrowCircleUp,
  CircleCheck as CheckCircle,
  Phone,
  RotateCcw as ClockCounterClockwise,
  ChevronDown as CaretDown,
  Share2 as ShareNetwork,
  CircleX as XCircle,
  Timer,
  TriangleAlert as Warning,
  CircleArrowDown as ArrowCircleDown,
  Link as LinkIcon,
  ShieldAlert as ShieldWarning,
  Navigation as NavigationArrow,
  Road as RoadHorizon,
  Cross as FirstAid,
  Download as DownloadSimple,
  FileText,
  Siren,
  Baby,
  Building2 as Buildings,
  Upload as UploadSimple,
} from 'lucide-react';
import { useDirections } from '@/hooks/useDirections';
import api from '@/api/client';
import { Incident, Vehicle, AuditLog, CallLog, PatientCareReport, MaternityVitals, Facility } from '@/types/api';
import EndCaseModal from '@/components/shared/EndCaseModal';
import { formatDistanceToNow } from 'date-fns';
import Map from '@/components/shared/Map';
import { useNotificationStore } from '@/stores/notificationStore';
import { useVehicleTracking } from '@/hooks/useVehicleTracking';
import { socket } from '@/lib/socket';
import { fmtDateTime, NBO_TZ } from '@/lib/datetime';
import { confirmDialog } from '@/lib/alert';

// Straight-line (great-circle) distance in km between two lat/lng points.
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371; // earth radius km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Friendly labels for the crew's hospital-handover vitals (stored on Task.handoverVitals).
const HANDOVER_VITAL_LABELS: Record<string, string> = {
  temperature: 'Temperature',
  pulseRate: 'Pulse',
  respirationRate: 'Respiration',
  bp: 'Blood Pressure',
  spo2: 'SPO2',
  gcs: 'GCS',
  fh: 'Foetal Heart',
  rbs: 'RBS',
};

function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();

  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [dispatcherComments, setDispatcherComments] = useState('');
  const [isEditingBrief, setIsEditingBrief] = useState(false);
  const [editedComplaint, setEditedComplaint] = useState('');
  const [editedLocation, setEditedLocation] = useState('');
  const [editedPlaceOfReferral, setEditedPlaceOfReferral] = useState('');
  const [editedTargetFacilityId, setEditedTargetFacilityId] = useState('');
  const [editedDispatcherChallenges, setEditedDispatcherChallenges] = useState('');
  const [editedPcrUrl, setEditedPcrUrl] = useState('');
  const [uploadingPcr, setUploadingPcr] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveReason, setResolveReason] = useState('');
  const [showEndCaseModal, setShowEndCaseModal] = useState(false);
  const [showAssignPartnerModal, setShowAssignPartnerModal] = useState(false);
  const [selectedPartnerAgencyId, setSelectedPartnerAgencyId] = useState('');
  const [partnerAssignReason, setPartnerAssignReason] = useState('');
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateCasualtyCount, setEscalateCasualtyCount] = useState('');
  const [escalateNotes, setEscalateNotes] = useState('');
  const [editedPreHospital, setEditedPreHospital] = useState('');
  const [editedChallenges, setEditedChallenges] = useState('');
  const [editedOtherNotes, setEditedOtherNotes] = useState('');
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignReason, setReassignReason] = useState('');
  const [reassignVehicleId, setReassignVehicleId] = useState('');

  // Fetch Incident
  const { data: incident, isLoading } = useQuery({
    queryKey: ['incident', id],
    queryFn: async () => {
      const res = await api.get(`/incidents/${id}`);
      const data = res.data.data as Incident;
      setEditedComplaint(data.chiefComplaint);
      setEditedLocation(data.locationName);
      setEditedPlaceOfReferral(data.placeOfReferral ?? '');
      setEditedTargetFacilityId(data.targetFacilityId ?? '');
      setEditedDispatcherChallenges(data.dispatcherChallenges ?? '');
      setEditedPcrUrl(data.pcrUrl ?? '');
      setEditedPreHospital(data.preHospitalManagement ?? '');
      setEditedChallenges(data.dispatcherChallenges ?? '');
      setEditedOtherNotes(data.partnerNotes ?? '');
      return data;
    },
    enabled: !!id,
    refetchInterval: 30_000,
  });

  const { data: tatData } = useQuery({
    queryKey: ['incident', id, 'tat'],
    queryFn: async () => {
      const res = await api.get(`/incidents/${id}/tat`);
      return res.data.data as {
        steps: { key: string; label: string; timestamp: string | null; durationFromPreviousMs: number | null }[];
        totalMs: number | null;
      };
    },
    enabled: !!id,
    refetchInterval: 30_000,
  });

  const { data: auditLog = [] } = useQuery({
    queryKey: ['incident', id, 'audit-log'],
    queryFn: async () => {
      const res = await api.get(`/incidents/${id}/audit-log`);
      return res.data.data as AuditLog[];
    },
    enabled: !!id && showAuditLog,
  });

  // Update Incident Mutation
  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<Incident>) => {
      return api.patch(`/incidents/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      setIsEditingBrief(false);
      addNotification({ type: 'success', title: 'Updated', message: 'Incident details updated successfully.' });
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Update Failed',
        message: err?.response?.data?.message || 'Could not update incident. Please try again.',
      });
    },
  });

  const clinicalNotesMutation = useMutation({
    mutationFn: () => api.patch(`/incidents/${id}`, {
      preHospitalManagement: editedPreHospital || undefined,
      dispatcherChallenges: editedChallenges || undefined,
      partnerNotes: editedOtherNotes || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      addNotification({ type: 'success', title: 'Saved', message: 'Clinical notes saved.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Save Failed', message: err?.response?.data?.message || 'Could not save clinical notes.' });
    },
  });

  // Fetch nearest vehicles - use lat/lng from incident if available, else list all
  const { data: nearestVehiclesRaw } = useQuery({
    queryKey: ['vehicles', 'nearest', incident?.id],
    queryFn: async () => {
      if (incident?.lat && incident?.lng) {
        const res = await api.get(`/dispatch/nearest-vehicles?lat=${incident.lat}&lng=${incident.lng}&limit=10`);
        return res.data.data as Vehicle[];
      }
      const res = await api.get('/admin/vehicles');
      return res.data.data as Vehicle[];
    },
    enabled: !!incident,
  });

  // Only show vehicles that can actually be dispatched right now
  const nearestVehicles = (nearestVehiclesRaw ?? []).filter(
    v => v.status === 'READY' && v.isActive && !!v.currentDriver
  );

  // Real-time: keep incident fresh when status changes or crew is assigned
  useEffect(() => {
    if (!id) return;
    function onIncidentUpdate(updated: Incident) {
      if (updated.id !== id) return;
      queryClient.setQueryData(['incident', id], (old: Incident | undefined) =>
        old ? { ...old, ...updated } : old
      );
    }
    function onTaskAssigned(task: { incidentId: string }) {
      if (task.incidentId !== id) return;
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
    }
    function onTaskUpdated(task: { incidentId?: string }) {
      if (task.incidentId && task.incidentId !== id) return;
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
    socket.on('incident:update', onIncidentUpdate);
    socket.on('task:assigned', onTaskAssigned);
    socket.on('task:updated', onTaskUpdated);
    return () => {
      socket.off('incident:update', onIncidentUpdate);
      socket.off('task:assigned', onTaskAssigned);
      socket.off('task:updated', onTaskUpdated);
    };
  }, [id, queryClient]);

  // Dispatch Mutation - creates a Task (crew pulled automatically from vehicle check-in)
  // Partner / offline ambulances - no tracker, no crew app. Dispatched by
  // recording the unit on the incident rather than creating a crew Task.
  const { data: partnerAmbulances = [] } = useQuery({
    queryKey: ['fleet', 'partner-ambulances'],
    queryFn: async () => {
      const res = await api.get('/fleet/partner-ambulances');
      return res.data.data as Array<{
        id: string;
        registrationNumber: string;
        vehicleType?: string | null;
        contactName?: string | null;
        contactPhone?: string | null;
        baseLocation?: string | null;
        agency?: { id: string; name: string } | null;
      }>;
    },
    staleTime: 5 * 60_000,
  });

  // A partner unit is chosen by prefixing its id, so one <select> can offer both
  // tracked vehicles and offline ambulances without ambiguous ids.
  const OFFLINE_PREFIX = 'partner:';
  const isOfflineSelected = selectedVehicleId.startsWith(OFFLINE_PREFIX);
  const selectedPartner = isOfflineSelected
    ? partnerAmbulances.find(a => a.id === selectedVehicleId.slice(OFFLINE_PREFIX.length))
    : undefined;

  const offlineDispatchMutation = useMutation({
    mutationFn: async () =>
      api.post(`/dispatch/assign-offline/${id}`, {
        partnerAmbulanceId: selectedVehicleId.slice(OFFLINE_PREFIX.length),
        notes: dispatcherComments || undefined,
      }),
    onSuccess: () => {
      queryClient.setQueryData(['incident', id], (old: any) => ({ ...old, status: 'DISPATCHED' }));
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      queryClient.invalidateQueries({ queryKey: ['dispatch', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      addNotification({
        type: 'success',
        title: 'Offline Ambulance Dispatched',
        message: `${selectedPartner?.registrationNumber ?? 'Unit'} recorded against case ${incident?.caseNumber}. Resolve the case manually once complete.`,
      });
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Dispatch Failed',
        message: err?.response?.data?.message || 'Could not dispatch that ambulance.',
      });
    },
  });

  const dispatchMutation = useMutation({
    mutationFn: async () => {
      return api.post('/tasks', {
        incidentId: id,
        vehicleId: selectedVehicleId,
        dispatcherComments: dispatcherComments || undefined,
      });
    },
    onSuccess: () => {
      queryClient.setQueryData(['incident', id], (old: any) => ({ ...old, status: 'DISPATCHED' }));
      queryClient.invalidateQueries({ queryKey: ['dispatch', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      addNotification({
        type: 'success',
        title: 'Crew Dispatched',
        message: `Crew has been assigned and dispatched for case ${incident?.caseNumber}.`,
      });
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Dispatch Failed',
        message: err?.response?.data?.message || 'Could not dispatch crew. Please try again.',
      });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/incidents/${id}/status`, { status: 'RESOLVED', comments: resolveReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setShowResolveModal(false);
      setResolveReason('');
      addNotification({ type: 'success', title: 'Case Resolved', message: `Case ${incident?.caseNumber} has been marked as resolved.` });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed to Resolve', message: err?.response?.data?.message || 'Could not resolve the incident.' });
    },
  });

  const { data: partnerAgencies = [] } = useQuery({
    queryKey: ['incidents', 'partner-agencies'],
    queryFn: async () => {
      const res = await api.get('/incidents/partner-agencies');
      return res.data.data as { id: string; name: string; location?: string }[];
    },
  });

  const assignPartnerMutation = useMutation({
    mutationFn: () =>
      api.post(`/incidents/${id}/assign-partner`, {
        partnerAgencyId: selectedPartnerAgencyId,
        reason: partnerAssignReason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      setShowAssignPartnerModal(false);
      setSelectedPartnerAgencyId('');
      setPartnerAssignReason('');
      addNotification({ type: 'success', title: 'Assigned', message: 'Case forwarded to partner agency.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not assign to partner.' });
    },
  });

  const reassignMutation = useMutation({
    mutationFn: (taskId: string) =>
      api.post(`/tasks/${taskId}/reassign`, {
        reason: reassignReason,
        newVehicleId: reassignVehicleId || undefined,
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      setShowReassignModal(false);
      setReassignReason('');
      setReassignVehicleId('');
      const reassigned = !!res?.data?.data?.newTask;
      addNotification({
        type: 'success',
        title: reassigned ? 'Reassigned' : 'Task terminated',
        message: reassigned
          ? 'Original crew checked out; a new crew has been dispatched.'
          : 'Original crew checked out. Case returned to dispatch handling.',
      });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not reassign the task.' });
    },
  });

  const escalateMutation = useMutation({
    mutationFn: () =>
      api.post(`/incidents/${id}/escalate`, {
        massCasualtyCount: Number(escalateCasualtyCount),
        notes: escalateNotes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      setShowEscalateModal(false);
      setEscalateCasualtyCount('');
      setEscalateNotes('');
      addNotification({ type: 'error', title: 'MCI Declared', message: `Case ${incident?.caseNumber} escalated. All dispatchers have been alerted.` });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Escalation Failed', message: err?.response?.data?.message || 'Could not escalate incident.' });
    },
  });

  const deescalateMutation = useMutation({
    mutationFn: () => api.post(`/incidents/${id}/deescalate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      addNotification({ type: 'success', title: 'De-escalated', message: `MCI flag removed from case ${incident?.caseNumber}.` });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not de-escalate.' });
    },
  });

  const sendToGbvMutation = useMutation({
    mutationFn: () => api.post(`/gbv/cases/${id}/flag`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      queryClient.invalidateQueries({ queryKey: ['gbv', 'cases'] });
      addNotification({ type: 'success', title: 'Sent to GBV', message: `Case ${incident?.caseNumber} has been flagged as a GBV case.` });
      navigate(`/gbv/cases/${id}`);
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not send to GBV.' });
    },
  });

  const { data: linkedCalls = [] } = useQuery({
    queryKey: ['pbx', 'cdr', 'linked', id],
    queryFn: async () => {
      const res = await api.get(`/pbx/cdr?incidentId=${id}&limit=20`);
      return res.data.data as CallLog[];
    },
    enabled: !!id,
  });

  const { data: unlinkedCalls = [], refetch: refetchUnlinked } = useQuery({
    queryKey: ['pbx', 'cdr', 'unlinked'],
    queryFn: async () => {
      const res = await api.get('/pbx/cdr?unlinked=true&limit=10&direction=INBOUND');
      return res.data.data as CallLog[];
    },
  });

  const linkCallMutation = useMutation({
    mutationFn: (callLogId: string) => api.patch(`/pbx/cdr/${callLogId}/link`, { incidentId: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pbx', 'cdr', 'linked', id] });
      refetchUnlinked();
      addNotification({ type: 'success', title: 'Call Linked', message: 'Call log linked to this incident.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not link call.' });
    },
  });

  // ── Active task + PCR reports from crew ──────────────────────────────────
  const activeTask = incident?.tasks
    ?.filter(t => t.status !== 'CANCELLED')
    ?.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())?.[0] ?? null;

  const { data: pcrReports = [] } = useQuery({
    queryKey: ['tasks', activeTask?.id, 'pcr-reports'],
    queryFn: async () => {
      const res = await api.get(`/tasks/${activeTask!.id}/patient-care-reports`);
      return res.data.data as PatientCareReport[];
    },
    enabled: !!activeTask?.id,
    refetchInterval: 30_000,
  });

  async function downloadPcrFile(report: PatientCareReport) {
    try {
      const res = await api.get(`/tasks/${report.taskId}/patient-care-reports/${report.id}/file`, {
        responseType: 'blob',
      });
      const ext = report.mimeType.includes('pdf') ? '.pdf'
        : report.mimeType.includes('image') ? '.jpg'
        : '.docx';
      const blob = new Blob([res.data as BlobPart], { type: report.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PCR_${report.id}${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      addNotification({ type: 'error', title: 'Download Failed', message: 'Could not download the PCR file.' });
    }
  }

  async function uploadPcr(file: File) {
    if (!activeTask?.id) {
      addNotification({ type: 'error', title: 'No Task', message: 'A vehicle must be dispatched before a PCR can be uploaded.' });
      return;
    }
    setUploadingPcr(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/tasks/${activeTask.id}/patient-care-report`, fd);
      await queryClient.invalidateQueries({ queryKey: ['tasks', activeTask.id, 'pcr-reports'] });
      addNotification({ type: 'success', title: 'PCR Uploaded', message: 'The patient care report was uploaded.' });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Upload Failed', message: err?.response?.data?.message || 'Could not upload the PCR file.' });
    } finally {
      setUploadingPcr(false);
    }
  }

  // ── Referral facilities (sorted nearest-to-scene) ─────────────────────────
  const { data: facilities = [] } = useQuery({
    queryKey: ['facilities'],
    queryFn: async () => {
      const res = await api.get('/incidents/facilities');
      return res.data.data as Facility[];
    },
    staleTime: 5 * 60_000,
  });

  const scenePoint = incident?.lat != null && incident?.lng != null
    ? { lat: incident.lat, lng: incident.lng }
    : null;

  // Prioritise facilities in the incident's administrative region (sub-county),
  // then by straight-line distance to the scene (requested change #3).
  const incidentRegion = incident?.subCounty?.trim().toLowerCase();
  const facilitiesByDistance = [...facilities]
    .map(f => ({
      facility: f,
      km: scenePoint ? haversineKm(scenePoint, { lat: f.lat, lng: f.lng }) : null,
      inRegion: !!incidentRegion && f.subCounty?.trim().toLowerCase() === incidentRegion,
    }))
    .sort((a, b) => {
      if (a.inRegion !== b.inRegion) return a.inRegion ? -1 : 1;
      return (a.km ?? Infinity) - (b.km ?? Infinity);
    });

  const selectedFacilityDistanceKm = scenePoint && incident?.targetFacility
    ? haversineKm(scenePoint, { lat: incident.targetFacility.lat, lng: incident.targetFacility.lng })
    : null;

  // ── Full fleet tracking (mirrors dispatch map) ────────────────────────────
  const { vehicles: liveVehicles } = useVehicleTracking();

  // ── Directions - vehicle en-route to incident ─────────────────────────────
  const dispatchedTask = incident?.tasks?.find(t => t.status === 'EN_ROUTE' || t.status === 'ACCEPTED');
  const dispatchedVehicle = dispatchedTask ? (nearestVehiclesRaw ?? []).find(v => v.id === dispatchedTask.vehicleId) : null;
  const vehicleOrigin = dispatchedVehicle?.lastLat && dispatchedVehicle?.lastLng
    ? { lat: dispatchedVehicle.lastLat, lng: dispatchedVehicle.lastLng }
    : null;
  const incidentDest = incident?.lat && incident?.lng ? { lat: incident.lat, lng: incident.lng } : null;
  const { result: directions, loading: directionsLoading, available: mapsAvailable } = useDirections(
    vehicleOrigin,
    incidentDest,
    !!vehicleOrigin && !!incidentDest
  );

  if (isLoading) return <div className="p-10 font-bold text-center text-slate-text">Loading Incident Details...</div>;
  if (!incident) return <div className="p-10 font-bold text-center text-status-danger">Incident Not Found</div>;

  const getStatusStep = () => {
    if (incident.status === 'DRAFT' || incident.status === 'SUBMITTED') return 1;
    if (incident.status === 'DISPATCH_HANDLING' || incident.status === 'DISPATCH_ON_HOLD') return 2;
    if (incident.status === 'DISPATCHED') return 3;
    if (incident.status === 'RESOLVED') return 4;
    return 1;
  };

  const step = getStatusStep();

  const fmtDuration = (ms: number): string => {
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  };

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-5 rounded-xl border border-surface-border">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs text-slate-text">Incidents / Detail</p>
            <h2 className="text-xl font-bold text-brand-teal mt-0.5">Case {incident.caseNumber}</h2>
          </div>
          {incident.massCasualty && (
            <span className="px-2.5 py-1 bg-status-danger/10 text-status-danger rounded-md font-medium text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-status-danger animate-pulse"></span>
              MCI
            </span>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 border border-surface-border text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-all flex items-center gap-2"
          >
            <Printer size={16} />
            Print
          </button>
          {incident.isGbvCase ? (
            <Link
              to={`/gbv/cases/${id}`}
              className="px-4 py-2 border border-status-danger/40 text-status-danger text-sm font-medium rounded-lg hover:bg-status-danger hover:text-white transition-all flex items-center gap-2"
            >
              <ShieldWarning size={16} />
              View GBV Report
            </Link>
          ) : (
            <button
              onClick={() => sendToGbvMutation.mutate()}
              disabled={incident.status === 'RESOLVED' || sendToGbvMutation.isPending}
              className="px-4 py-2 border border-status-danger/40 text-status-danger text-sm font-medium rounded-lg hover:bg-status-danger hover:text-white transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShieldWarning size={16} />
              Send to GBV
            </button>
          )}
          <button
            onClick={() => setShowAssignPartnerModal(true)}
            disabled={incident.status === 'RESOLVED'}
            className="px-4 py-2 border border-brand-teal/30 text-brand-teal text-sm font-medium rounded-lg hover:bg-brand-teal hover:text-white transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ShareNetwork size={16} />
            Assign to Partner
          </button>
          {incident.massCasualty ? (
            <button
              onClick={async () => {
                const confirmed = await confirmDialog({
                  title: 'Remove MCI Flag',
                  text: `This will remove the Mass Casualty Incident flag from ${incident.caseNumber} and clear the casualty count. The case will remain open.`,
                  confirmLabel: 'De-escalate',
                });
                if (confirmed) deescalateMutation.mutate();
              }}
              className="px-4 py-2 border border-slate-300 text-slate-500 text-sm font-medium rounded-lg hover:bg-slate-100 transition-all flex items-center gap-2"
            >
              <ArrowCircleDown size={16} />
              De-escalate
            </button>
          ) : (
            <button
              onClick={() => setShowEscalateModal(true)}
              disabled={incident.status === 'RESOLVED'}
              className="px-4 py-2 border border-status-danger/30 text-status-danger text-sm font-medium rounded-lg hover:bg-status-danger hover:text-white transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowCircleUp size={16} />
              Escalate to MCI
            </button>
          )}
          <button
            onClick={() => setShowResolveModal(true)}
            disabled={incident.status === 'RESOLVED'}
            className="px-4 py-2 border border-brand-green/40 text-brand-green text-sm font-medium rounded-lg hover:bg-brand-green hover:text-white transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCircle size={16} />
            {incident.status === 'RESOLVED' ? 'Resolved' : 'Resolve'}
          </button>
          <button
            onClick={() => setShowEndCaseModal(true)}
            disabled={incident.status === 'RESOLVED'}
            className="px-4 py-2 bg-status-danger text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <XCircle size={16} />
            End Case
          </button>
        </div>
      </div>

      {/* Google Maps ETA panel - only shows when Maps key is configured + vehicle is en-route */}
      {mapsAvailable && vehicleOrigin && (
        <div className="bg-white border border-surface-border rounded-xl shadow-sm p-5 flex items-center gap-5">
          <div className="w-10 h-10 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0">
            <NavigationArrow size={20} className="text-brand-green" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-text tracking-wide mb-1">Live Route to Scene</p>
            {directionsLoading ? (
              <p className="text-sm text-slate-400">Calculating route…</p>
            ) : directions ? (
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-2xl font-bold text-brand-teal">{directions.durationText}</p>
                  <p className="text-xs text-slate-text">ETA (with traffic)</p>
                </div>
                <div className="text-slate-300">|</div>
                <div>
                  <p className="text-lg font-semibold text-slate-700">{directions.distanceText}</p>
                  <p className="text-xs text-slate-text">Distance</p>
                </div>
                {directions.steps[0] && (
                  <>
                    <div className="text-slate-300">|</div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <RoadHorizon size={14} className="text-slate-400" />
                      <span className="line-clamp-1">{directions.steps[0]}</span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No route data - vehicle or incident coordinates missing.</p>
            )}
          </div>
        </div>
      )}

      {/* Status Timeline */}
      <div className="bg-white p-6 border border-surface-border rounded-xl shadow-sm">
        <div className="flex items-center w-full">
          <div className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step >= 1 ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-text'}`}>1</div>
              <span className={`mt-2 text-xs font-medium ${step >= 1 ? 'text-brand-green' : 'text-slate-text'}`}>Submitted</span>
            </div>
            <div className={`flex-1 h-px mx-4 ${step > 1 ? 'bg-brand-green' : 'bg-slate-200'}`}></div>
          </div>
          <div className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step >= 2 ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-text'}`}>2</div>
              <span className={`mt-2 text-xs font-medium ${step >= 2 ? 'text-brand-green' : 'text-slate-text'}`}>Handling</span>
            </div>
            <div className={`flex-1 h-px mx-4 ${step > 2 ? 'bg-brand-green' : 'bg-slate-200'}`}></div>
          </div>
          <div className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step >= 3 ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-text'}`}>3</div>
              <span className={`mt-2 text-xs font-medium ${step >= 3 ? 'text-brand-green' : 'text-slate-text'}`}>Dispatched</span>
            </div>
            <div className={`flex-1 h-px mx-4 ${step > 3 ? 'bg-brand-green' : 'bg-slate-200'}`}></div>
          </div>
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step >= 4 ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-text'}`}>4</div>
            <span className={`mt-2 text-xs font-medium ${step >= 4 ? 'text-brand-green' : 'text-slate-text'}`}>Resolved</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left Column: Details */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
          
          <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-border bg-slate-50 flex justify-between items-center">
              <h3 className="font-semibold text-brand-teal">Incident Brief</h3>
              {!isEditingBrief ? (
                <button
                  onClick={() => setIsEditingBrief(true)}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-brand-teal transition-all"
                >
                  <PencilSimple size={18} />
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditingBrief(false)}
                    className="px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-slate-600 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => updateMutation.mutate({
                      chiefComplaint: editedComplaint,
                      locationName: editedLocation,
                      placeOfReferral: editedPlaceOfReferral || undefined,
                      targetFacilityId: editedTargetFacilityId,
                      dispatcherChallenges: editedDispatcherChallenges || undefined,
                      pcrUrl: editedPcrUrl || undefined,
                    })}
                    disabled={updateMutation.isPending}
                    className="px-4 py-1.5 bg-brand-teal text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
            <div className="p-6 grid grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Chief Complaint</label>
                {isEditingBrief ? (
                  <input
                    type="text"
                    value={editedComplaint}
                    onChange={(e) => setEditedComplaint(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-sm text-brand-teal focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal outline-none transition-all"
                  />
                ) : (
                  <p className="text-sm text-brand-teal font-semibold">{incident.chiefComplaint}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Location</label>
                {isEditingBrief ? (
                  <input
                    type="text"
                    value={editedLocation}
                    onChange={(e) => setEditedLocation(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-sm text-brand-teal focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal outline-none transition-all"
                  />
                ) : (
                  <div className="flex items-start gap-2">
                    <MapPin size={16} className="text-brand-green mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-brand-teal">{incident.locationName}</p>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                        {incident.subCounty}
                        {incident.subCountySource === 'AUTO' && (
                          <span className="text-[9px] font-black tracking-wide px-1.5 py-0.5 rounded-full" style={{ background: '#ECFDF5', color: '#047857' }}>auto</span>
                        )}
                        {incident.subCountySource === 'MANUAL' && (
                          <span className="text-[9px] font-black tracking-wide px-1.5 py-0.5 rounded-full" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>manual</span>
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Referral Facility</label>
                {isEditingBrief ? (
                  <>
                    <select
                      value={editedTargetFacilityId}
                      onChange={e => setEditedTargetFacilityId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-sm text-brand-teal focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal outline-none transition-all"
                    >
                      <option value="">- No referral facility -</option>
                      {facilitiesByDistance.map(({ facility, km, inRegion }) => (
                        <option key={facility.id} value={facility.id}>
                          {inRegion ? '★ ' : ''}{facility.name} · {facility.type}{km != null ? ` · ~${km.toFixed(1)} km` : ''}{inRegion ? ` · ${facility.subCounty}` : ''}
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const sel = facilitiesByDistance.find(x => x.facility.id === editedTargetFacilityId);
                      if (!sel) return null;
                      return (
                        <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                          <NavigationArrow size={12} className="text-brand-green" />
                          {sel.km != null ? `~${sel.km.toFixed(1)} km from scene (straight-line)` : 'Scene location not geocoded - distance unavailable'}
                        </p>
                      );
                    })()}
                    {!scenePoint && (
                      <p className="text-[11px] text-amber-500 mt-1">Scene has no coordinates, so distances can't be shown.</p>
                    )}
                  </>
                ) : incident.targetFacility ? (
                  <div className="flex items-start gap-2">
                    <Buildings size={16} className="text-brand-teal mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-brand-teal font-semibold">{incident.targetFacility.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {incident.targetFacility.type} · KEPH {incident.targetFacility.kephLevel}
                        {selectedFacilityDistanceKm != null && <> · <span className="text-brand-green font-medium">~{selectedFacilityDistanceKm.toFixed(1)} km from scene</span></>}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-brand-teal">{incident.placeOfReferral || '-'}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Dispatcher Challenges</label>
                {isEditingBrief ? (
                  <input
                    type="text"
                    value={editedDispatcherChallenges}
                    onChange={e => setEditedDispatcherChallenges(e.target.value)}
                    placeholder="e.g. Traffic on Uhuru Highway"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-sm text-brand-teal focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal outline-none transition-all"
                  />
                ) : (
                  <p className="text-sm text-brand-teal">{incident.dispatcherChallenges || '-'}</p>
                )}
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-400 block mb-1.5">PCR Report URL</label>
                {isEditingBrief ? (
                  <input
                    type="url"
                    value={editedPcrUrl}
                    onChange={e => setEditedPcrUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-sm text-brand-teal focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal outline-none transition-all"
                  />
                ) : incident.pcrUrl ? (
                  <a
                    href={incident.pcrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand-teal underline hover:opacity-70 transition-opacity"
                  >
                    View PCR Report →
                  </a>
                ) : (
                  <p className="text-sm text-slate-400">-</p>
                )}
              </div>
              <div className="col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-100">
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Caller Notes</label>
                <p className="italic text-slate-500 text-sm leading-relaxed">"{incident.watcherComments || incident.dispatcherComments || 'No specific notes provided.'}"</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-border bg-slate-50">
              <h3 className="font-semibold text-brand-teal">Patient Information</h3>
            </div>
            <div className="p-6 grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-text block mb-1">Full Name</label>
                <p className="text-sm font-semibold text-brand-teal">{incident.patientName || 'Unknown'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-text block mb-1">Age</label>
                <p className="text-sm text-brand-teal">{incident.patientAge || 'Unknown'} yrs</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-text block mb-1">Gender</label>
                <p className="text-sm text-brand-teal">{incident.patientGender || 'Unknown'}</p>
              </div>
              {incident.patientContact && (
                <div>
                  <label className="text-xs font-medium text-slate-text block mb-1">Patient Contact</label>
                  <p className="text-sm font-semibold text-brand-teal">{incident.patientContact}</p>
                </div>
              )}
              {incident.patientNationalId && (
                <div>
                  <label className="text-xs font-medium text-slate-text block mb-1">National ID</label>
                  <p className="text-sm text-brand-teal">{incident.patientNationalId}</p>
                </div>
              )}
              {incident.nextOfKin && (
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-text block mb-1">Next of Kin</label>
                  <p className="text-sm text-brand-teal">{incident.nextOfKin}</p>
                </div>
              )}
              {(incident.healthcareWorkerName || incident.healthcareWorkerContact) && (
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-text block mb-1">Healthcare Worker Contacted</label>
                  <p className="text-sm text-brand-teal">
                    {[incident.healthcareWorkerName, incident.healthcareWorkerContact].filter(Boolean).join(' · ')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Forwarding History */}
          {(incident.forwardingLogs ?? []).length > 0 && (
            <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-surface-border bg-slate-50 flex items-center gap-2">
                <ShareNetwork size={16} className="text-brand-teal" />
                <h3 className="font-semibold text-brand-teal text-sm">Partner Forwarding History</h3>
                <span className="ml-auto text-xs font-bold bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-full">
                  {incident.forwardingLogs!.length}
                </span>
              </div>
              <div className="divide-y divide-surface-border/50">
                {incident.forwardingLogs!.map((log, i) => (
                  <div key={log.id} className="px-6 py-4 flex gap-4 items-start">
                    <div className="w-6 h-6 rounded-full bg-brand-teal/10 text-brand-teal text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-slate-400">{log.fromAgency.name}</span>
                        <span className="text-xs text-slate-300">→</span>
                        <span className="text-sm font-semibold text-brand-teal">{log.toAgency.name}</span>
                        <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
                          {fmtDateTime(log.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 italic">"{log.reason}"</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Call Records */}
          <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-border bg-slate-50 flex items-center gap-2">
              <Phone size={16} className="text-brand-teal" />
              <h3 className="font-semibold text-brand-teal text-sm">Call Records</h3>
              {linkedCalls.length > 0 && (
                <span className="ml-auto text-xs font-bold bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-full">
                  {linkedCalls.length} linked
                </span>
              )}
            </div>

            {/* Calls already linked to this incident */}
            {linkedCalls.length > 0 && (
              <div className="divide-y divide-surface-border/50">
                {linkedCalls.map(call => (
                  <div key={call.id} className="px-6 py-3 flex items-center gap-3">
                    <Phone size={13} className="text-brand-green flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-teal">{call.callFrom}</p>
                      <p className="text-xs text-slate-400">
                        {fmtDateTime(call.startedAt)}
                        {' · '}{call.talkDuration}s talk
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                      call.status === 'ANSWERED' ? 'bg-brand-green/10 text-brand-green' : 'bg-slate-100 text-slate-400'
                    }`}>{call.status}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recent unlinked calls */}
            <div className={`p-4 ${linkedCalls.length > 0 ? 'border-t border-surface-border/50' : ''}`}>
              <p className="text-xs font-medium text-slate-400 mb-3 tracking-wide">
                Recent unlinked calls - tap to link
              </p>
              {unlinkedCalls.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">No recent unlinked inbound calls.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {unlinkedCalls.map(call => (
                    <button
                      key={call.id}
                      onClick={() => linkCallMutation.mutate(call.id)}
                      disabled={linkCallMutation.isPending}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-brand-teal/5 border border-transparent hover:border-brand-teal/20 transition-all text-left group disabled:opacity-50"
                    >
                      <Phone size={13} className="text-slate-300 group-hover:text-brand-teal flex-shrink-0 transition-colors" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-brand-teal">{call.callFrom}</p>
                        <p className="text-xs text-slate-400">
                          {fmtDateTime(call.startedAt)}
                          {' · '}{call.talkDuration}s
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md flex-shrink-0 ${
                        call.status === 'ANSWERED' ? 'bg-brand-green/10 text-brand-green' : 'bg-slate-100 text-slate-400'
                      }`}>{call.status}</span>
                      <LinkIcon size={14} className="text-slate-200 group-hover:text-brand-teal flex-shrink-0 transition-colors" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Dispatch Panel */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
          {step >= 3 ? (
          <div className="bg-white border border-surface-border rounded-xl shadow-sm p-8 flex flex-col items-center text-center gap-2">
            {incident.status === 'RESOLVED' ? (
              <>
                <CheckCircle size={32} className="text-brand-green" />
                <h3 className="font-semibold text-brand-teal">Case Resolved</h3>
                <p className="text-sm text-slate-text max-w-xs">
                  Dispatch actions are locked for closed cases. See the crew report below for the full dispatch history.
                </p>
              </>
            ) : (
              <>
                <PaperPlaneRight size={32} className="text-brand-teal" />
                <h3 className="font-semibold text-brand-teal">Vehicle Already Dispatched</h3>
                <p className="text-sm text-slate-text max-w-xs">
                  A crew is already assigned to this case. See the crew report below to track status, or use Reassign / Terminate to swap vehicles.
                </p>
              </>
            )}
          </div>
          ) : (
          <>
          <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden flex flex-col max-h-[400px]">
            <div className="px-6 py-4 border-b border-surface-border bg-slate-50 flex justify-between items-center">
              <h3 className="font-semibold text-brand-teal">Nearest Vehicles</h3>
              <span className="flex items-center gap-1.5 text-xs text-brand-green font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse"></span>
                Live
              </span>
            </div>
            <div className="overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white z-10 border-b border-surface-border">
                  <tr className="bg-slate-50">
                    <th className="px-6 py-3 text-xs font-medium text-slate-text">Unit</th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-text">Status</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {nearestVehicles.map(v => (
                    <tr key={v.id} className={`border-b border-surface-border hover:bg-slate-50 cursor-pointer transition-colors ${selectedVehicleId === v.id ? 'bg-brand-green/5' : ''}`} onClick={() => setSelectedVehicleId(v.id)}>
                      <td className="px-6 py-3">
                        <p className="font-semibold text-brand-teal text-sm">{v.registrationNumber}</p>
                        <p className="text-xs text-slate-text mt-0.5">
                          {v.currentDriver?.name ?? '-'}
                          {v.currentEmt ? ` · EMT ${v.currentEmt.name}` : ''}
                          {v.currentNurse ? ` · Nurse ${v.currentNurse.name}` : ''}
                        </p>
                      </td>
                      <td className="px-6 py-3">
                        <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-brand-green/10 text-brand-green">
                          Ready
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <CaretRight size={16} className="text-slate-text" />
                      </td>
                    </tr>
                  ))}
                  {nearestVehicles.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-6 text-center text-sm text-slate-text">No vehicles with a driver available nearby.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div id="dispatch-panel" className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-border bg-slate-50">
              <h3 className="font-semibold text-brand-teal">Dispatch Assignment</h3>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-slate-text block mb-1">Vehicle Unit</label>
                <select
                  className="w-full bg-white border border-surface-border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-green outline-none"
                  value={selectedVehicleId}
                  onChange={e => setSelectedVehicleId(e.target.value)}
                >
                  <option value="">Select available unit...</option>
                  {(nearestVehicles || []).length > 0 && (
                    <optgroup label="Tracked units (GPS + crew app)">
                      {(nearestVehicles || []).map(v => (
                        <option key={v.id} value={v.id}>
                          {v.registrationNumber}
                          {v.currentDriver ? ` - ${v.currentDriver.name}` : ' - no driver'}
                          {v.currentEmt ? ` / EMT ${v.currentEmt.name}` : ''}
                          {v.currentNurse ? ` / Nurse ${v.currentNurse.name}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {partnerAmbulances.length > 0 && (
                    <optgroup label="Offline / partner ambulances (no tracker)">
                      {partnerAmbulances.map(a => (
                        <option key={a.id} value={`${OFFLINE_PREFIX}${a.id}`}>
                          {a.registrationNumber}
                          {a.agency?.name ? ` - ${a.agency.name}` : ''}
                          {a.vehicleType ? ` · ${a.vehicleType}` : ''}
                          {a.baseLocation ? ` · ${a.baseLocation}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Offline ambulance preview - contact details, since there's no app */}
              {selectedPartner && (
                <div className="rounded-lg p-4 border text-sm bg-status-info/5 border-status-info/30">
                  <p className="text-xs font-black tracking-widest mb-3 text-slate-400">
                    Offline unit - contact by phone
                  </p>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-400">Agency</span>
                    <span className="text-xs font-semibold text-brand-teal">{selectedPartner.agency?.name ?? '-'}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-400">Contact</span>
                    <span className="text-xs font-semibold text-brand-teal">{selectedPartner.contactName ?? '-'}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-400">Phone</span>
                    <span className="text-xs font-semibold text-brand-teal">{selectedPartner.contactPhone ?? '-'}</span>
                  </div>
                  <p className="text-xs text-slate-text mt-3">
                    This unit has no GPS tracker or crew app - no live tracking or automatic
                    status updates. Call the crew directly, then Resolve the case manually
                    when it's complete.
                  </p>
                </div>
              )}

              {/* Crew Preview - shows who is checked in to the selected vehicle */}
              {selectedVehicleId && (() => {
                const sv = (nearestVehicles || []).find(v => v.id === selectedVehicleId);
                if (!sv) return null;
                const hasDriver = !!sv.currentDriver;
                return (
                  <div className={`rounded-lg p-4 border text-sm ${hasDriver ? 'bg-brand-green/5 border-brand-green/20' : 'bg-status-warning/5 border-status-warning/30'}`}>
                    <p className="text-xs font-black tracking-widest mb-3 text-slate-400">Crew on board</p>
                    {[
                      { role: 'Driver', person: sv.currentDriver },
                      { role: 'EMT', person: sv.currentEmt },
                      { role: 'Nurse', person: sv.currentNurse },
                    ].map(({ role, person }) => (
                      <div key={role} className="flex items-center justify-between py-1">
                        <span className="text-xs text-slate-400">{role}</span>
                        <span className={`text-xs font-semibold ${person ? 'text-brand-teal' : role === 'Driver' ? 'text-status-danger' : 'text-slate-400'}`}>
                          {person?.name ?? (role === 'Driver' ? 'Not checked in' : 'Unassigned')}
                        </span>
                      </div>
                    ))}
                    {!hasDriver && (
                      <p className="text-xs text-status-warning font-medium mt-3">
                        A driver must be checked in via the mobile app before dispatching.
                      </p>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="text-xs font-medium text-slate-text block mb-1">Dispatcher Notes</label>
                <textarea
                  className="w-full bg-white border border-surface-border rounded-lg px-4 py-2.5 text-sm h-24 resize-none outline-none focus:ring-2 focus:ring-brand-green"
                  placeholder="Enter notes for the crew..."
                  value={dispatcherComments}
                  onChange={e => setDispatcherComments(e.target.value)}
                ></textarea>
              </div>
              <button
                onClick={() => (isOfflineSelected ? offlineDispatchMutation.mutate() : dispatchMutation.mutate())}
                disabled={
                  !selectedVehicleId ||
                  // Offline units have no driver account by design - only tracked
                  // vehicles require a checked-in driver.
                  (!isOfflineSelected &&
                    !(nearestVehicles || []).find(v => v.id === selectedVehicleId)?.currentDriver) ||
                  dispatchMutation.isPending ||
                  offlineDispatchMutation.isPending ||
                  step >= 3
                }
                className="w-full bg-brand-green text-white text-sm py-3 rounded-lg font-semibold hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PaperPlaneRight size={18} />
                {step >= 3
                  ? 'Already Dispatched'
                  : dispatchMutation.isPending || offlineDispatchMutation.isPending
                  ? 'Dispatching...'
                  : isOfflineSelected
                  ? 'Dispatch Offline Ambulance'
                  : 'Dispatch Vehicle'}
              </button>
            </div>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Crew & Clinical Report - shown after dispatch */}
      {activeTask && (
        <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-border bg-slate-50 flex items-center gap-2">
            <Siren size={16} className="text-brand-teal" />
            <h3 className="font-semibold text-brand-teal text-sm">Ambulance Crew Report</h3>
            <span className={`ml-2 text-xs font-semibold px-2.5 py-1 rounded-md ${
              activeTask.status === 'COMPLETED'      ? 'bg-brand-green/10 text-brand-green' :
              activeTask.status === 'AT_SCENE'       ? 'bg-brand-teal/10 text-brand-teal' :
              activeTask.status === 'AT_HOSPITAL'    ? 'bg-status-info/10 text-status-info' :
              activeTask.status === 'PATIENT_PICKED' ? 'bg-amber-100 text-amber-700' :
              activeTask.status === 'EN_ROUTE'       ? 'bg-brand-green/10 text-brand-green' :
              'bg-slate-100 text-slate-500'
            }`}>{activeTask.status.replace(/_/g, ' ')}</span>
            {activeTask.vehicle && (
              <span className="ml-auto text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                Unit: {activeTask.vehicle.registrationNumber}
              </span>
            )}
            {activeTask.status !== 'COMPLETED' && activeTask.status !== 'CANCELLED' && (
              <button
                onClick={() => { setReassignReason(''); setReassignVehicleId(''); setShowReassignModal(true); }}
                className={`text-xs font-semibold px-2.5 py-1 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50 transition-all ${activeTask.vehicle ? 'ml-2' : 'ml-auto'}`}
                title="Hand over or terminate this task and optionally reassign to another crew"
              >
                Reassign / Terminate
              </button>
            )}
          </div>

          <div className="p-6 flex flex-col gap-6">
            {/* Crew Members */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { role: 'Driver', member: activeTask.driver },
                { role: 'EMT',    member: activeTask.emt },
                { role: 'Nurse',  member: activeTask.nurse },
              ].map(({ role, member }) => (
                <div key={role} className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1">{role}</p>
                  {member ? (
                    <>
                      <p className="text-sm font-semibold text-brand-teal">{member.name}</p>
                      {member.phone && <p className="text-xs text-slate-400 mt-0.5">{member.phone}</p>}
                    </>
                  ) : (
                    <p className="text-sm text-slate-300">Not assigned</p>
                  )}
                </div>
              ))}
            </div>

            {/* Task Status Timestamps */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {[
                { label: 'Received',       ts: activeTask.receivedAt },
                { label: 'Accepted',       ts: activeTask.acceptedAt },
                { label: 'At Scene',       ts: activeTask.sceneArrivalAt },
                { label: 'Patient Picked', ts: activeTask.patientPickAt },
                { label: 'At Hospital',    ts: activeTask.facilityArrivalAt },
              ].map(({ label, ts }) => (
                <div key={label} className={`rounded-lg p-3 border ${ts ? 'bg-brand-green/5 border-brand-green/20' : 'bg-slate-50 border-slate-100'}`}>
                  <p className="text-[10px] font-black tracking-widest mb-1 text-slate-400">{label}</p>
                  <p className={`text-xs font-semibold ${ts ? 'text-brand-teal' : 'text-slate-300'}`}>
                    {ts ? fmtDateTime(ts) : '-'}
                  </p>
                </div>
              ))}
            </div>

            {/* Hospital Handover Vitals - captured by crew at handover (#7) */}
            {activeTask.handoverVitals && Object.values(activeTask.handoverVitals).some(Boolean) && (
              <div className="border border-surface-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 border-b border-surface-border flex items-center gap-2">
                  <FirstAid size={14} className="text-brand-teal" />
                  <p className="text-xs font-semibold text-slate-600 tracking-wide">Vitals at Hospital Handover</p>
                </div>
                <div className="p-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {Object.entries(activeTask.handoverVitals)
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k}>
                        <p className="text-[9px] font-black tracking-widest text-slate-400 mb-0.5">{HANDOVER_VITAL_LABELS[k] ?? k}</p>
                        <p className="text-sm font-semibold text-brand-teal">{String(v)}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Clinical Notes - dispatcher-editable */}
            <div className="border border-surface-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-surface-border flex items-center gap-2">
                <FirstAid size={14} className="text-brand-teal" />
                <p className="text-xs font-semibold text-slate-600 tracking-wide">Clinical Notes</p>
              </div>
              <div className="p-5 flex flex-col gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 tracking-widest block mb-1.5">
                    Management Given
                  </label>
                  <textarea
                    rows={3}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-brand-teal resize-none outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition-all placeholder:text-slate-300"
                    placeholder="Document interventions, medications administered, patient condition on scene..."
                    value={editedPreHospital}
                    onChange={e => setEditedPreHospital(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 tracking-widest block mb-1.5">
                    Challenges Experienced
                  </label>
                  <textarea
                    rows={2}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-brand-teal resize-none outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition-all placeholder:text-slate-300"
                    placeholder="Access issues, traffic, patient non-compliance, equipment failure..."
                    value={editedChallenges}
                    onChange={e => setEditedChallenges(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 tracking-widest block mb-1.5">
                    Other Notes
                  </label>
                  <textarea
                    rows={2}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-brand-teal resize-none outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition-all placeholder:text-slate-300"
                    placeholder="Any additional observations or handover information..."
                    value={editedOtherNotes}
                    onChange={e => setEditedOtherNotes(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => clinicalNotesMutation.mutate()}
                    disabled={clinicalNotesMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 bg-brand-green text-white text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle size={16} />
                    {clinicalNotesMutation.isPending ? 'Saving...' : 'Save Clinical Notes'}
                  </button>
                </div>
              </div>
            </div>

            {/* PCR Reports uploaded by crew */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-brand-teal" />
                  <p className="text-xs font-semibold text-slate-500 tracking-wide">
                    Patient Care Reports (PCR)
                    {pcrReports.length > 0 && (
                      <span className="ml-2 bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-full text-[10px] font-bold">{pcrReports.length}</span>
                    )}
                  </p>
                </div>
                <label
                  title={activeTask ? 'Upload or re-upload a PCR file' : 'Dispatch a vehicle first to attach a PCR'}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex-shrink-0 ${activeTask && !uploadingPcr ? 'text-brand-teal border-brand-teal/30 hover:bg-brand-teal hover:text-white cursor-pointer' : 'text-slate-300 border-slate-200 cursor-not-allowed'}`}
                >
                  <UploadSimple size={14} />
                  {uploadingPcr ? 'Uploading…' : pcrReports.length > 0 ? 'Re-upload PCR' : 'Upload PCR'}
                  <input
                    type="file"
                    accept="image/*,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    disabled={!activeTask || uploadingPcr}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) uploadPcr(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              {pcrReports.length === 0 ? (
                <p className="text-xs text-slate-400 py-3">No PCR files uploaded yet. Crew upload after task completion, or upload one here.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {pcrReports.map(report => (
                    <div key={report.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-surface-border hover:border-brand-teal/30 hover:bg-brand-teal/5 transition-all group">
                      <FileText size={18} className="text-brand-teal flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-brand-teal truncate">
                          {report.mimeType.includes('pdf') ? 'PDF Report' : report.mimeType.includes('image') ? 'Image Report' : 'Document Report'}
                        </p>
                        {report.note && <p className="text-xs text-slate-400 truncate mt-0.5">{report.note}</p>}
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {(report.fileSize / 1024).toFixed(1)} KB · {fmtDateTime(report.createdAt)}
                        </p>
                      </div>
                      <button
                        onClick={() => downloadPcrFile(report)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-teal border border-brand-teal/30 rounded-lg hover:bg-brand-teal hover:text-white transition-all flex-shrink-0"
                      >
                        <DownloadSimple size={14} />
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Maternity Vitals - shown when alertNature is maternity */}
      {incident?.maternityVitals && (() => {
        const mv = incident.maternityVitals as MaternityVitals;
        const row = (label: string, val?: string | null) => val ? (
          <div key={label} className="flex flex-col gap-0.5">
            <span className="text-[9px] font-black tracking-widest text-slate-400">{label}</span>
            <span className="text-sm font-medium text-brand-teal">{val}</span>
          </div>
        ) : null;
        return (
          <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-border bg-pink-50 flex items-center gap-2">
              <Baby size={16} className="text-pink-500" />
              <h3 className="font-semibold text-pink-700 text-sm">Maternity Vitals</h3>
            </div>
            <div className="p-5 space-y-4">
              {(mv.admissionDateTime || mv.parity || mv.gravid) && (
                <div>
                  <p className="text-[9px] font-black tracking-widest text-slate-400 mb-2">Mother Information</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {row('Admission', mv.admissionDateTime)}
                    {row('Parity', mv.parity)}
                    {row('Gravida', mv.gravid)}
                  </div>
                </div>
              )}
              {(mv.fetalHeartRate || mv.membranes || mv.characterOfLiquor || mv.moulding || mv.cervicalDilatation || mv.descent || mv.uterineContraction || mv.medicationsFetal) && (
                <div className="border-t border-surface-border pt-4">
                  <p className="text-[9px] font-black tracking-widest text-slate-400 mb-2">Fetal Well-being</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {row('Fetal HR', mv.fetalHeartRate)}
                    {row('Membranes', mv.membranes)}
                    {row('Liquor', mv.characterOfLiquor)}
                    {row('Moulding', mv.moulding)}
                    {row('Cervix', mv.cervicalDilatation)}
                    {row('Descent', mv.descent)}
                    {row('Contractions', mv.uterineContraction)}
                    {row('Meds (Fetal)', mv.medicationsFetal)}
                  </div>
                </div>
              )}
              {(mv.bp || mv.pulse || mv.temperature || mv.rbs || mv.spo2 || mv.gcs || mv.proteinInUrine || mv.glucoseInUrine || mv.urineOutput) && (
                <div className="border-t border-surface-border pt-4">
                  <p className="text-[9px] font-black tracking-widest text-slate-400 mb-2">Maternal Well-being</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {row('BP', mv.bp)}
                    {row('Pulse', mv.pulse)}
                    {row('Temp', mv.temperature)}
                    {row('RBS', mv.rbs)}
                    {row('SPO₂', mv.spo2)}
                    {row('GCS', mv.gcs)}
                    {row('Protein', mv.proteinInUrine)}
                    {row('Glucose', mv.glucoseInUrine)}
                    {row('Urine Output', mv.urineOutput)}
                  </div>
                </div>
              )}
              {(mv.deliveryDateTime || mv.modeOfDelivery || mv.newbornGender || mv.birthWeight || mv.conditionOfBaby || mv.medicationNewborn || mv.apgar1Min || mv.apgar5Min || mv.apgar10Min) && (
                <div className="border-t border-surface-border pt-4">
                  <p className="text-[9px] font-black tracking-widest text-slate-400 mb-2">Newborn</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {row('Delivery Time', mv.deliveryDateTime)}
                    {row('Mode', mv.modeOfDelivery)}
                    {row('Gender', mv.newbornGender)}
                    {row('Birth Weight', mv.birthWeight)}
                    {row('Condition', mv.conditionOfBaby)}
                    {row('APGAR (1/5/10)', [mv.apgar1Min, mv.apgar5Min, mv.apgar10Min].some(Boolean) ? `${mv.apgar1Min || '–'} / ${mv.apgar5Min || '–'} / ${mv.apgar10Min || '–'}` : undefined)}
                    {row('Meds (Newborn)', mv.medicationNewborn)}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Scene Map - full width, tall panel */}
      <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-border bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-status-danger" />
            <h3 className="font-semibold text-brand-teal">Scene Map</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-text">
              <span className="w-2 h-2 bg-status-danger rounded-full animate-pulse"></span>
              Scene
            </div>
            {liveVehicles.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-brand-green font-medium">
                <span className="w-2 h-2 bg-brand-green rounded-full"></span>
                {liveVehicles.filter(v => v.dbStatus === 'READY' && v.hasDriver).length} ready · {liveVehicles.length} tracked
              </div>
            )}
          </div>
        </div>
        <div className="h-[440px] relative">
          <Map
            center={[incident.lat || -1.2921, incident.lng || 36.8219]}
            zoom={14}
            markers={[{ id: incident.id, lat: incident.lat || -1.2921, lng: incident.lng || 36.8219, title: incident.caseNumber, type: 'incident' }]}
            vehicleMarkers={liveVehicles}
            onVehicleClick={v => {
              const isDispatchable = nearestVehicles.some(nv => nv.id === v.vehicleId);
              if (isDispatchable) {
                setSelectedVehicleId(v.vehicleId);
                document.getElementById('dispatch-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else {
                addNotification({
                  type: 'error',
                  title: 'Not Available',
                  message: `${v.registration} is ${v.dbStatus === 'BUSY' ? 'already on a call' : v.dbStatus === 'MAINTENANCE' ? 'under maintenance' : 'not ready for dispatch'}.`,
                });
              }
            }}
          />
        </div>
      </div>

      {/* TAT Timeline */}
      <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-border bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer size={16} className="text-brand-teal" />
            <h3 className="font-semibold text-brand-teal text-sm">Response Timeline (TAT)</h3>
          </div>
          {tatData?.totalMs != null && (
            <span className="text-xs font-semibold bg-brand-teal/10 text-brand-teal px-2.5 py-1 rounded-md">
              Total: {fmtDuration(tatData.totalMs)}
            </span>
          )}
        </div>
        <div className="p-6">
          {!tatData ? (
            <p className="text-sm text-slate-400 text-center py-4">Loading timeline…</p>
          ) : (
            <div className="flex flex-col">
              {tatData.steps.map((s, i) => {
                const done = s.timestamp !== null;
                const isLast = i === tatData.steps.length - 1;
                return (
                  <div key={s.key} className="flex gap-4">
                    {/* Left: dot + connector */}
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ${done ? 'bg-brand-green' : 'border-2 border-slate-200 bg-white'}`} />
                      {!isLast && <div className={`w-px flex-1 mt-1 mb-1 min-h-[24px] ${done ? 'bg-brand-green/30' : 'bg-slate-100'}`} />}
                    </div>
                    {/* Right: step info */}
                    <div className={`flex-1 pb-4 ${isLast ? '' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={`text-sm font-semibold ${done ? 'text-brand-teal' : 'text-slate-300'}`}>{s.label}</p>
                          {s.timestamp && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              {new Date(s.timestamp).toLocaleString('en-GB', {
                                timeZone: NBO_TZ,
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit', second: '2-digit',
                              })}
                            </p>
                          )}
                        </div>
                        {s.durationFromPreviousMs != null && s.durationFromPreviousMs > 0 && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-md flex-shrink-0 ${
                            s.durationFromPreviousMs > 10 * 60_000
                              ? 'bg-status-danger/10 text-status-danger'
                              : s.durationFromPreviousMs > 5 * 60_000
                              ? 'bg-status-warning/10 text-status-warning'
                              : 'bg-brand-green/10 text-brand-green'
                          }`}>
                            +{fmtDuration(s.durationFromPreviousMs)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Audit Log */}
      <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowAuditLog(v => !v)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ClockCounterClockwise size={16} className="text-slate-400" />
            <span className="font-semibold text-brand-teal text-sm">Change History</span>
            {auditLog.length > 0 && (
              <span className="text-xs font-bold bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-full">{auditLog.length}</span>
            )}
          </div>
          <CaretDown
            size={16}
            className={`text-slate-400 transition-transform duration-200 ${showAuditLog ? 'rotate-180' : ''}`}
          />
        </button>

        {showAuditLog && (
          <div className="border-t border-surface-border divide-y divide-surface-border/50">
            {auditLog.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-slate-400">No changes recorded yet.</p>
            ) : auditLog.map(entry => (
              <div key={entry.id} className="px-6 py-4 flex gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white ${
                  entry.action === 'CREATE' ? 'bg-brand-green' :
                  entry.action === 'STATUS_CHANGE' ? 'bg-brand-teal' :
                  'bg-slate-400'
                }`}>
                  {entry.action === 'CREATE' ? '+' : entry.action === 'STATUS_CHANGE' ? '→' : '✎'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-brand-teal">{entry.user.name}</span>
                    <span className="text-xs text-slate-400 tracking-wide">{entry.user.role.replace('_', ' ')}</span>
                    <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
                      {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {entry.action === 'CREATE' && 'Incident created'}
                    {entry.action === 'STATUS_CHANGE' && `Status changed: ${String(entry.oldValues?.status ?? '')} → ${String(entry.newValues?.status ?? '')}`}
                    {entry.action === 'UPDATE' && (
                      Object.keys(entry.newValues ?? {}).map(k =>
                        `${k}: "${String(entry.oldValues?.[k] ?? '-')}" → "${String(entry.newValues?.[k] ?? '')}"`
                      ).join(' · ')
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolve Modal */}
      {/* Reassign / Terminate Task Modal (#10) */}
      {showReassignModal && activeTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-surface-border w-full max-w-md mx-4 p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-bold text-brand-teal">Reassign / Terminate Task</h3>
              <p className="text-sm text-slate-text mt-1">
                Current unit <span className="font-semibold text-brand-teal">{activeTask.vehicle?.registrationNumber ?? '-'}</span> will be checked out.
                Pick a replacement to dispatch a new crew, or leave it blank to just terminate and return the case to dispatch handling.
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 tracking-widest block mb-1.5">Reason (required)</label>
              <textarea
                autoFocus
                className="w-full border border-surface-border rounded-lg p-3 text-sm h-24 resize-none outline-none focus:ring-2 focus:ring-brand-green transition-all"
                placeholder="e.g. Vehicle broke down at scene, reassigning to nearest available unit..."
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-1">Minimum 5 characters required.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 tracking-widest block mb-1.5">Replacement unit (optional)</label>
              <select
                className="w-full border border-surface-border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green transition-all"
                value={reassignVehicleId}
                onChange={(e) => setReassignVehicleId(e.target.value)}
              >
                <option value="">- Terminate only (no replacement) -</option>
                {(nearestVehicles || [])
                  .filter(v => v.id !== activeTask.vehicleId && v.currentDriver)
                  .map(v => {
                    const km = (v as { distanceKm?: number }).distanceKm;
                    return (
                      <option key={v.id} value={v.id}>
                        {v.registrationNumber}{km != null ? ` · ~${km.toFixed(1)} km` : ''}
                      </option>
                    );
                  })}
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowReassignModal(false); setReassignReason(''); setReassignVehicleId(''); }}
                className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => reassignMutation.mutate(activeTask.id)}
                disabled={reassignReason.trim().length < 5 || reassignMutation.isPending}
                className="px-5 py-2 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:brightness-110 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reassignMutation.isPending ? 'Working...' : reassignVehicleId ? 'Reassign Crew' : 'Terminate Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-surface-border w-full max-w-md mx-4 p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-bold text-brand-teal">Resolve Incident</h3>
              <p className="text-sm text-slate-text mt-1">
                Provide a reason for closing case <span className="font-semibold text-brand-teal">{incident.caseNumber}</span>. This will be recorded against the incident.
              </p>
            </div>
            <textarea
              autoFocus
              className="w-full border border-surface-border rounded-lg p-3 text-sm h-28 resize-none outline-none focus:ring-2 focus:ring-brand-green transition-all"
              placeholder="e.g. Patient transferred to Kenyatta Hospital, crew released and unit returned to base..."
              value={resolveReason}
              onChange={(e) => setResolveReason(e.target.value)}
            />
            <p className="text-xs text-slate-400 -mt-2">Minimum 5 characters required.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowResolveModal(false); setResolveReason(''); }}
                className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => resolveMutation.mutate()}
                disabled={resolveReason.trim().length < 5 || resolveMutation.isPending}
                className="px-5 py-2 bg-brand-green text-white text-sm font-semibold rounded-lg hover:brightness-110 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle size={16} />
                {resolveMutation.isPending ? 'Resolving...' : 'Mark as Resolved'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign to Partner Modal */}
      {showAssignPartnerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-surface-border w-full max-w-md mx-4 p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-bold text-brand-teal flex items-center gap-2">
                <ShareNetwork size={20} className="text-brand-teal" />
                Assign to Partner
              </h3>
              <p className="text-sm text-slate-text mt-1">
                Forward case <span className="font-semibold text-brand-teal">{incident.caseNumber}</span> to a partner agency. The case stays on your system with the forwarding logged. The partner agency will be notified immediately via their portal.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-text block mb-1.5">Partner Agency</label>
              <select
                value={selectedPartnerAgencyId}
                onChange={e => setSelectedPartnerAgencyId(e.target.value)}
                className="w-full border border-surface-border rounded-lg px-3 py-2.5 text-sm text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal bg-slate-50"
              >
                <option value="">Select a partner agency...</option>
                {partnerAgencies.map(a => (
                  <option key={a.id} value={a.id}>{a.name}{a.location ? ` - ${a.location}` : ''}</option>
                ))}
              </select>
              {partnerAgencies.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">No active partner agencies found.</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-text block mb-1.5">Reason for Assignment</label>
              <textarea
                autoFocus
                className="w-full border border-surface-border rounded-lg p-3 text-sm h-24 resize-none outline-none focus:ring-2 focus:ring-brand-teal transition-all"
                placeholder="e.g. Patient requires specialist care beyond EOC capacity..."
                value={partnerAssignReason}
                onChange={e => setPartnerAssignReason(e.target.value)}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowAssignPartnerModal(false); setSelectedPartnerAgencyId(''); setPartnerAssignReason(''); }}
                className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => assignPartnerMutation.mutate()}
                disabled={!selectedPartnerAgencyId || partnerAssignReason.trim().length < 5 || assignPartnerMutation.isPending}
                className="px-5 py-2 bg-brand-teal text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShareNetwork size={16} />
                {assignPartnerMutation.isPending ? 'Assigning...' : 'Forward to Partner'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escalate to MCI Modal */}
      {showEscalateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-surface-border w-full max-w-md mx-4 p-6 flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-status-danger/10 flex items-center justify-center flex-shrink-0">
                <Warning size={20} className="text-status-danger" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-brand-teal">Escalate to Mass Casualty Incident</h3>
                <p className="text-sm text-slate-text mt-1">
                  This will flag <span className="font-semibold text-brand-teal">{incident.caseNumber}</span> as an MCI and send an urgent alert to <span className="font-semibold">all active dispatchers and admins</span>.
                </p>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-text block mb-1.5">Estimated Casualties <span className="text-status-danger">*</span></label>
              <input
                type="number"
                min="1"
                autoFocus
                value={escalateCasualtyCount}
                onChange={e => setEscalateCasualtyCount(e.target.value)}
                placeholder="e.g. 12"
                className="w-full border border-surface-border rounded-lg px-4 py-2.5 text-sm font-semibold text-brand-teal focus:ring-2 focus:ring-status-danger/30 focus:border-status-danger outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-text block mb-1.5">Additional Notes (optional)</label>
              <textarea
                value={escalateNotes}
                onChange={e => setEscalateNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Multi-vehicle RTA on Thika Road, heavy extrication required..."
                className="w-full border border-surface-border rounded-lg px-4 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-status-danger/30 focus:border-status-danger transition-all"
              />
            </div>
            <div className="bg-status-danger/5 border border-status-danger/20 rounded-lg px-4 py-3">
              <p className="text-xs text-status-danger font-medium">All connected dispatchers will receive an immediate MCI alert notification.</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowEscalateModal(false); setEscalateCasualtyCount(''); setEscalateNotes(''); }}
                className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => escalateMutation.mutate()}
                disabled={!escalateCasualtyCount || Number(escalateCasualtyCount) < 1 || escalateMutation.isPending}
                className="px-5 py-2 bg-status-danger text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Warning size={16} />
                {escalateMutation.isPending ? 'Escalating...' : 'Declare MCI'}
              </button>
            </div>
          </div>
        </div>
      )}


      {incident && (
        <EndCaseModal
          incidentId={incident.id}
          caseNumber={incident.caseNumber}
          isOpen={showEndCaseModal}
          onClose={() => setShowEndCaseModal(false)}
          onSuccess={() => navigate('/dashboard')}
          invalidateKeys={[['incidents']]}
        />
      )}
    </div>
  );
}

export default IncidentDetailPage;
