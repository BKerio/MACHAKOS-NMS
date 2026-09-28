import { haversineDistance } from '../../shared/utils/haversine.js';

/**
 * Check-in location verification: does the crew member's phone put them at
 * the ambulance, going by the vehicle's own GPS tracker?
 *
 * Deliberately never blocks a check-in or a dispatch - it records the verdict
 * so dispatchers can see it and decide.
 */

export type CheckInLocationMatch = 'MATCHED' | 'MISMATCH' | 'UNVERIFIED';

/** Phone and tracker within this distance count as the same place. */
export const MATCH_RADIUS_M = 300;

/** Extra slack for a poor phone fix (indoors, first fix), capped so a
 *  wildly inaccurate reading can't stretch the radius to cover a town. */
export const MAX_ACCURACY_ALLOWANCE_M = 200;

/** A parked tracker with the ignition off reports rarely, but its last fix
 *  still says where the vehicle is. Older than this, don't trust it. */
export const TRACKER_FIX_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface PhoneFix {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  /** The OS flagged the fix as simulated (Android mock provider, iOS 15+
   *  isSimulatedBySoftware). */
  mocked?: boolean;
}

export interface TrackerFix {
  lat: number | null;
  lng: number | null;
  at: Date | null;
}

export interface CheckInLocationVerdict {
  match: CheckInLocationMatch;
  /** Phone-to-tracker distance in metres, when there is any tracker fix. */
  distanceM: number | null;
  reason: 'within_radius' | 'too_far' | 'mock_location' | 'no_tracker_fix' | 'stale_tracker_fix' | 'imprecise_phone_fix';
}

export function assessCheckInLocation(phone: PhoneFix, tracker: TrackerFix | null, now: Date = new Date()): CheckInLocationVerdict {
  const hasFix = tracker?.lat != null && tracker.lng != null && tracker.at != null;
  const distanceM = hasFix
    ? Math.round(haversineDistance(phone.lat, phone.lng, tracker!.lat!, tracker!.lng!) * 1000)
    : null;

  // A spoofed phone location proves nothing either way.
  if (phone.mocked) return { match: 'MISMATCH', distanceM, reason: 'mock_location' };

  if (!hasFix) return { match: 'UNVERIFIED', distanceM: null, reason: 'no_tracker_fix' };
  if (now.getTime() - tracker!.at!.getTime() > TRACKER_FIX_MAX_AGE_MS) {
    return { match: 'UNVERIFIED', distanceM, reason: 'stale_tracker_fix' };
  }

  const reported = Math.max(0, phone.accuracyM ?? 0);
  if (distanceM! <= MATCH_RADIUS_M + Math.min(reported, MAX_ACCURACY_ALLOWANCE_M)) {
    return { match: 'MATCHED', distanceM, reason: 'within_radius' };
  }
  // A fuzzy fix (e.g. iOS with Precise Location off reports ~3-5 km) can't
  // prove the crew member is away if the tracker sits inside its error
  // circle - but it can't prove they're there either. Beyond that circle
  // they're away however fuzzy the fix, so switching precision off doesn't
  // help anyone hide.
  if (reported > MAX_ACCURACY_ALLOWANCE_M && distanceM! <= MATCH_RADIUS_M + reported) {
    return { match: 'UNVERIFIED', distanceM, reason: 'imprecise_phone_fix' };
  }
  return { match: 'MISMATCH', distanceM, reason: 'too_far' };
}

/** "180 m" / "12.4 km" for messages. */
export function formatDistance(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}
