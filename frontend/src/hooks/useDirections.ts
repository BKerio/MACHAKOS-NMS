import { useState, useEffect } from 'react';
import { loadMapsLibrary, mapsReady } from '@/lib/mapsLoader';

export interface DirectionsResult {
  durationText: string;    // e.g. "12 mins"
  durationSecs: number;
  distanceText: string;    // e.g. "4.2 km"
  distanceMetres: number;
  steps: string[];         // turn-by-turn instructions (plain text)
  polyline: string;        // encoded polyline for drawing the route
}

export function useDirections(
  origin: { lat: number; lng: number } | null,
  destination: { lat: number; lng: number } | null,
  enabled = true
) {
  const [result, setResult] = useState<DirectionsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapsReady || !enabled || !origin || !destination) {
      setResult(null);
      return;
    }

    let cancelled = false;

    async function fetchDirections() {
      setLoading(true);
      setError(null);
      try {
        await loadMapsLibrary('routes');
        const service = new google.maps.DirectionsService();
        const res = await service.route({
          origin: new google.maps.LatLng(origin!.lat, origin!.lng),
          destination: new google.maps.LatLng(destination!.lat, destination!.lng),
          travelMode: google.maps.TravelMode.DRIVING,
          drivingOptions: {
            departureTime: new Date(),
            trafficModel: google.maps.TrafficModel.BEST_GUESS,
          },
        });

        if (cancelled) return;

        const leg = res.routes[0]?.legs[0];
        if (!leg) { setError('No route found'); return; }

        setResult({
          durationText: leg.duration_in_traffic?.text ?? leg.duration?.text ?? '',
          durationSecs: leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0,
          distanceText: leg.distance?.text ?? '',
          distanceMetres: leg.distance?.value ?? 0,
          steps: leg.steps.map(s => s.instructions.replace(/<[^>]+>/g, '')),
          polyline: res.routes[0].overview_polyline,
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Directions request failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDirections();
    return () => { cancelled = true; };
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, enabled]);

  return { result, loading, error, available: mapsReady };
}
