import api from '@/api/client';
import type {
  AssignableCrewMember,
  CrewTask,
  PaginatedMeta,
  PartnerAmbulance,
  PatientCareReport,
  Task,
  TaskHistoryItem,
  TaskStatus,
  User,
  Vehicle,
} from '@/types/api';

// ── Profile (self-service) ────────────────────────────────────────────────────

export async function getMyProfile(): Promise<User> {
  const res = await api.get('/auth/me');
  return res.data.data as User;
}

export async function updateMyProfile(data: {
  name?: string;
  phone?: string;
  currentPassword?: string;
  newPassword?: string;
}): Promise<User> {
  const res = await api.patch('/auth/me', data);
  return res.data.data as User;
}

// ── Active task / status lifecycle ────────────────────────────────────────────

export async function getActiveTask(): Promise<CrewTask | null> {
  const res = await api.get('/tasks/active');
  return res.data.data as CrewTask | null;
}

export async function getTaskHistory(page = 1, limit = 15): Promise<{ data: TaskHistoryItem[]; meta: PaginatedMeta }> {
  const res = await api.get('/tasks/history', { params: { page, limit } });
  return { data: res.data.data as TaskHistoryItem[], meta: res.data.meta as PaginatedMeta };
}

export async function updateTaskStatus(taskId: string, status: TaskStatus, reason?: string): Promise<Task> {
  const res = await api.patch(`/tasks/${taskId}/status`, { status, reason });
  return res.data.data as Task;
}

export async function closeIncident(incidentId: string, reason: string): Promise<void> {
  await api.post(`/incidents/${incidentId}/close`, { reason });
}

export async function handoverTask(
  taskId: string,
  data: { reason: string; newVehicleId?: string; autoAssign?: boolean }
): Promise<{ cancelled: Task; newTask: Task | null; checkedOutVehicleId: string }> {
  const res = await api.post(`/tasks/${taskId}/reassign`, data);
  return res.data.data;
}

// ── Patient data & PCR ────────────────────────────────────────────────────────

export async function submitPatientData(
  taskId: string,
  data: { preHospitalManagement: string; dispatcherChallenges?: string }
): Promise<void> {
  await api.post(`/tasks/${taskId}/patient-data`, data);
}

export async function uploadPatientCareReport(
  taskId: string,
  input: { note?: string; file: File }
): Promise<PatientCareReport> {
  const form = new FormData();
  if (input.note) form.append('note', input.note);
  form.append('file', input.file, input.file.name);

  const res = await api.post(`/tasks/${taskId}/patient-care-report`, form, { timeout: 60000 });
  return res.data.data as PatientCareReport;
}

export async function getPatientCareReports(taskId: string): Promise<PatientCareReport[]> {
  const res = await api.get(`/tasks/${taskId}/patient-care-reports`);
  return res.data.data as PatientCareReport[];
}

/** Fetches an authenticated PCR file as a blob: URL the browser can open/preview. Caller should revokeObjectURL when done. */
export async function getPatientCareReportFileUrl(taskId: string, reportId: string): Promise<string> {
  const res = await api.get(`/tasks/${taskId}/patient-care-reports/${reportId}/file`, { responseType: 'blob' });
  return URL.createObjectURL(res.data as Blob);
}

// ── Fleet / crew check-in ─────────────────────────────────────────────────────

export async function getAgencyVehicles(): Promise<Vehicle[]> {
  const res = await api.get('/fleet/vehicles');
  return res.data.data as Vehicle[];
}

export async function getPartnerAmbulances(): Promise<PartnerAmbulance[]> {
  const res = await api.get('/fleet/partner-ambulances');
  const payload = res.data?.data ?? res.data;
  return Array.isArray(payload) ? payload : [];
}

export async function getMyCheckIn(): Promise<Vehicle | null> {
  const res = await api.get('/fleet/my-checkin');
  return res.data.data as Vehicle | null;
}

export async function checkInToVehicle(
  vehicleId: string,
  data: { lat: number; lng: number; locationName?: string | null; file: File }
): Promise<Vehicle> {
  const form = new FormData();
  form.append('lat', String(data.lat));
  form.append('lng', String(data.lng));
  if (data.locationName) form.append('locationName', data.locationName);
  form.append('file', data.file, data.file.name);

  const res = await api.post(`/fleet/${vehicleId}/checkin`, form, { timeout: 60000 });
  return res.data.data as Vehicle;
}

export async function checkOutFromVehicle(vehicleId: string): Promise<Vehicle> {
  const res = await api.delete(`/fleet/${vehicleId}/checkin`);
  return res.data.data as Vehicle;
}

export async function getAssignableCrew(): Promise<AssignableCrewMember[]> {
  const res = await api.get('/fleet/crew-members');
  return res.data.data as AssignableCrewMember[];
}

export async function assignVehicleCrew(
  vehicleId: string,
  crew: { emtId?: string | null; nurseId?: string | null }
): Promise<Vehicle> {
  const res = await api.post(`/fleet/${vehicleId}/crew`, crew);
  return res.data.data as Vehicle;
}

export async function getAvailableHandoverVehicles(opts?: {
  excludeVehicleId?: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<Vehicle[]> {
  const params: Record<string, string> = {};
  if (opts?.excludeVehicleId) params.excludeVehicleId = opts.excludeVehicleId;
  if (opts?.lat != null && Number.isFinite(opts.lat)) params.lat = String(opts.lat);
  if (opts?.lng != null && Number.isFinite(opts.lng)) params.lng = String(opts.lng);
  const res = await api.get('/fleet/available-for-handover', { params: Object.keys(params).length ? params : undefined });
  return res.data.data as Vehicle[];
}

// ── Browser geolocation helper (used by shift check-in) ──────────────────────

export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.message || 'Could not get your location. Please allow location access.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

export function getErrorMessage(err: unknown): string {
  const anyErr = err as any;
  return anyErr?.response?.data?.message || anyErr?.message || 'Something went wrong. Please try again.';
}
