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
export async function fetchDrivingRoute(
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
