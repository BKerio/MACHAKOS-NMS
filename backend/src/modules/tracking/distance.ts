import { haversineDistance } from '../../shared/utils/haversine.js';

/**
 * Hour-by-hour distance from the 65-second GPS poll.
 *
 * Each poll, every ambulance's new fix is compared with the previous one
 * (stored on the vehicle) and the leg between them is added to the clock hour
 * (Africa/Nairobi) of the new fix. The tracker's own odometer is preferred
 * when the feed carries one; otherwise the straight-line leg is used, which
 * slightly under-counts winding roads but never invents distance.
 */

/** Below this a parked unit's GPS drift is noise, not driving. */
export const JITTER_KM = 0.03;
/** Faster than any ambulance: the fix jumped, the leg is discarded. */
export const MAX_PLAUSIBLE_KMH = 180;
/** A gap this long (tracker offline) can't be measured honestly - restart from the new fix. */
export const MAX_GAP_MS = 15 * 60 * 1000;

export interface Sample {
  lat: number;
  lng: number;
  at: Date;
  odometerKm: number | null;
}

/**
 * Km driven between two samples, or null when the leg can't be trusted
 * (same/older fix, too long a gap, impossible speed). 0 = parked/jitter.
 */
export function legKm(prev: Sample, next: Sample, moving: boolean): { km: number; source: 'ODOMETER' | 'GPS' } | null {
  const ms = next.at.getTime() - prev.at.getTime();
  if (ms <= 0 || ms > MAX_GAP_MS) return null;
  const hours = ms / 3_600_000;

  if (prev.odometerKm != null && next.odometerKm != null) {
    const km = next.odometerKm - prev.odometerKm;
    if (km < 0 || km / hours > MAX_PLAUSIBLE_KMH) return null; // reset or glitch
    return { km, source: 'ODOMETER' };
  }

  const km = haversineDistance(prev.lat, prev.lng, next.lat, next.lng);
  if (km / hours > MAX_PLAUSIBLE_KMH) return null;
  // Ignition off and barely moved: GPS wander around a parking spot.
  if (!moving && km < JITTER_KM) return { km: 0, source: 'GPS' };
  return { km: km < JITTER_KM / 3 ? 0 : km, source: 'GPS' };
}

/** Start of the Africa/Nairobi clock hour containing `d` (UTC+3, no DST). */
export function nairobiHourStart(d: Date): Date {
  const shifted = new Date(d.getTime() + 3 * 3_600_000);
  shifted.setUTCMinutes(0, 0, 0);
  return new Date(shifted.getTime() - 3 * 3_600_000);
}

/**
 * Uffizio's live feed has no documented odometer field, but some trackers
 * report one; accept the common spellings (km). Anything else -> null.
 */
export function extractOdometerKm(raw: Record<string, unknown>): number | null {
  for (const key of Object.keys(raw ?? {})) {
    if (!/^odo(meter)?(_?km|_?value)?$/i.test(key)) continue;
    const v = parseFloat(String(raw[key]).replace(/,/g, ''));
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}
