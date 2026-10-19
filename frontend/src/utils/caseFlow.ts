import type { CrewTask } from '@/types/api';

/** "850 m" / "4.2 km", as the crew app shows distances. */
export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/**
 * The PCR upload page for a case. With `rateFacility`, saving or skipping the
 * PCR continues to rating that facility (the end-of-case flow).
 */
export function pcrPath(taskId: string, caseNumber: string, rateFacility?: string): string {
  const q = new URLSearchParams({ caseNumber });
  if (rateFacility) q.set('rateFacility', rateFacility);
  return `/operator/tasks/${taskId}/patient-care-report?${q.toString()}`;
}

/** The facility rating page; `next=pcr` continues to the PCR afterwards. */
export function ratingPath(
  taskId: string,
  opts: { caseNumber: string; facility: string; next?: 'pcr' | 'history'; stars?: number }
): string {
  const q = new URLSearchParams({ caseNumber: opts.caseNumber, facility: opts.facility });
  if (opts.next) q.set('next', opts.next);
  if (opts.stars) q.set('stars', String(opts.stars));
  return `/operator/tasks/${taskId}/rate-facility?${q.toString()}`;
}

/**
 * Where the crew goes once a case is completed: file the PCR (the handover
 * record) first, then rate the receiving facility.
 */
export function afterCompletePath(task: CrewTask): string {
  return pcrPath(task.id, task.incident.caseNumber, task.incident.targetFacility?.name);
}

/** Navigate-page URL for the hospital leg: routed from the scene, not from where the ambulance is. */
export function hospitalRouteUrl(task: CrewTask): string | null {
  const f = task.incident.targetFacility;
  const sceneLat = task.pickupLat ?? task.incident.lat;
  const sceneLng = task.pickupLng ?? task.incident.lng;
  if (f?.lat == null || f?.lng == null || sceneLat == null || sceneLng == null) return null;
  const q = new URLSearchParams({
    lat: String(f.lat), lng: String(f.lng), label: f.name,
    fromLat: String(sceneLat), fromLng: String(sceneLng),
  });
  return `/operator/navigate?${q.toString()}`;
}
