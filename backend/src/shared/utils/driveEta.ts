/**
 * Drive-time ETAs between ambulances and scenes - many vehicles to one scene
 * (case page) or one vehicle to many scenes (dashboard vehicle panel).
 *
 * Order: Google Routes API computeRouteMatrix, traffic-aware (if GOOGLE_MAPS_KEY set)
 * → straight-line estimate. The legacy Distance Matrix API is not enabled on
 * the project, so this must use the Routes API.
 */
import { haversineDistance } from './haversine.js';

export interface DriveEta {
  /** Seconds to reach the destination, or null if no route exists. */
  durationSecs: number | null;
  distanceKm: number | null;
  /** 'google' = road route with live traffic; 'estimate' = straight-line guess. */
  source: 'google' | 'estimate';
}

export interface Point { lat: number; lng: number }

// Straight-line fallback: roads run ~1.3× the crow-flies distance, and an
// ambulance on mixed urban/rural roads averages ~45 km/h.
const ROAD_FACTOR = 1.3;
const AVG_SPEED_KMH = 45;

function estimate(origin: Point, dest: Point): DriveEta {
  const km = haversineDistance(dest.lat, dest.lng, origin.lat, origin.lng) * ROAD_FACTOR;
  return { durationSecs: Math.round((km / AVG_SPEED_KMH) * 3600), distanceKm: km, source: 'estimate' };
}

const waypoint = (p: Point) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });

/** ETA matrix indexed [origin][destination]; null where Google gave no answer. */
async function routeMatrixGoogle(origins: Point[], dests: Point[], apiKey: string): Promise<(DriveEta | null)[][]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,condition',
      },
      body: JSON.stringify({
        origins: origins.map(waypoint),
        destinations: dests.map(waypoint),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Routes API ${res.status}`);
    const rows: any[] = await res.json();

    const out: (DriveEta | null)[][] = origins.map(() => dests.map(() => null));
    for (const r of rows) {
      const o = r.originIndex ?? 0;
      const d = r.destinationIndex ?? 0;
      if (r.condition === 'ROUTE_NOT_FOUND') {
        out[o][d] = { durationSecs: null, distanceKm: null, source: 'google' };
      } else if (r.duration) {
        out[o][d] = {
          durationSecs: parseInt(String(r.duration), 10), // "1234s"
          distanceKm: typeof r.distanceMeters === 'number' ? r.distanceMeters / 1000 : null,
          source: 'google',
        };
      }
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

async function etaMatrix(origins: Point[], dests: Point[], googleMapsKey?: string | null): Promise<DriveEta[][]> {
  const key = (googleMapsKey || process.env.GOOGLE_MAPS_KEY || '').trim();
  let google: (DriveEta | null)[][] = [];
  if (key) {
    try {
      google = await routeMatrixGoogle(origins, dests, key);
    } catch {
      // fall through to estimates
    }
  }
  return origins.map((o, i) => dests.map((d, j) => google[i]?.[j] ?? estimate(o, d)));
}

/** Many vehicles → one scene. */
export async function driveEtas(origins: Point[], dest: Point, googleMapsKey?: string | null): Promise<DriveEta[]> {
  if (origins.length === 0) return [];
  return (await etaMatrix(origins, [dest], googleMapsKey)).map((row) => row[0]);
}

/** One vehicle → many scenes. */
export async function driveEtasFrom(origin: Point, dests: Point[], googleMapsKey?: string | null): Promise<DriveEta[]> {
  if (dests.length === 0) return [];
  return (await etaMatrix([origin], dests, googleMapsKey))[0];
}
