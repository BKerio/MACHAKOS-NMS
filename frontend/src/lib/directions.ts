import { loadMapsLibrary, mapsReady } from '@/lib/mapsLoader';

export interface DrivingRoute {
  path: [number, number][];
  distanceText: string;
  durationText: string;
}

/**
 * Client-side driving route via the Google Maps JS SDK's DirectionsService.
 * Unlike the mobile app (which hits the Directions REST endpoint directly),
 * the browser can't call that endpoint itself - Google doesn't set CORS
 * headers on it. Going through the already-loaded JS SDK sidesteps that.
 */
async function fetchGoogleDrivingRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<DrivingRoute | null> {
  if (!mapsReady) return null;

  await loadMapsLibrary('routes');
  const service = new google.maps.DirectionsService();
  const result = await service.route({
    origin,
    destination,
    travelMode: google.maps.TravelMode.DRIVING,
  });

  const route = result.routes[0];
  const leg = route?.legs?.[0];
  if (!route || !leg) return null;

  return {
    path: route.overview_path.map((p) => [p.lat(), p.lng()] as [number, number]),
    distanceText: leg.distance?.text ?? '',
    durationText: leg.duration?.text ?? '',
  };
}

function formatKm(meters: number): string {
  const km = meters / 1000;
  return km < 1 ? `${Math.round(meters)} m` : `${km.toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} hr${m ? ` ${m} min` : ''}`;
}

/**
 * Free, no-API-key driving route via OSRM's public demo routing server -
 * same "no key needed" fallback tier as the Leaflet/Carto map (see Map.tsx).
 * Used when Google's Directions API is unavailable (no key, billing
 * disabled, quota, offline Maps JS load failure, etc.) so drivers still get
 * a real road-following route instead of just a straight line.
 * Note: router.project-osrm.org is a shared public demo instance with no
 * uptime guarantee - fine as a fallback, not meant for high-volume primary use.
 */
async function fetchOsrmDrivingRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<DrivingRoute | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const route = data?.routes?.[0];
  const coords: [number, number][] | undefined = route?.geometry?.coordinates;
  if (!route || !coords?.length) return null;

  return {
    path: coords.map(([lng, lat]) => [lat, lng] as [number, number]),
    distanceText: formatKm(route.distance),
    durationText: formatDuration(route.duration),
  };
}

/**
 * Best-effort driving route: tries Google first (richer, matches Google's
 * own road data), falls back to the free OSRM route on any failure so
 * in-app navigation still works without a paid/configured Google key.
 */
export async function fetchDrivingRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<DrivingRoute | null> {
  try {
    const route = await fetchGoogleDrivingRoute(origin, destination);
    if (route) return route;
  } catch {
    // fall through to OSRM
  }

  try {
    return await fetchOsrmDrivingRoute(origin, destination);
  } catch {
    return null;
  }
}
