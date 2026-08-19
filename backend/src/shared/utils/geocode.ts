/**
 * Reverse-geocode lat/lng → human place name (e.g. "Kilimani, Nairobi").
 *
 * Order: Google Geocoding API (if GOOGLE_MAPS_KEY set) → OpenStreetMap Nominatim.
 */

function pickGooglePlaceLabel(components: Array<{ long_name: string; types: string[] }>): string | null {
  const byType = (type: string) =>
    components.find((c) => c.types.includes(type))?.long_name?.trim() || null;

  // Prefer neighbourhood / suburb-level names (Kilimani, Westlands, …)
  const primary =
    byType('neighborhood') ||
    byType('sublocality_level_1') ||
    byType('sublocality') ||
    byType('sublocality_level_2') ||
    byType('administrative_area_level_3') ||
    byType('colloquial_area') ||
    byType('locality') ||
    byType('administrative_area_level_2') ||
    byType('administrative_area_level_1');

  if (!primary) return null;

  const city =
    byType('locality') ||
    byType('administrative_area_level_2') ||
    byType('administrative_area_level_1');

  if (city && city.toLowerCase() !== primary.toLowerCase()) {
    return `${primary}, ${city}`;
  }
  return primary;
}

function pickNominatimLabel(address: Record<string, string>, displayName?: string): string | null {
  const primary =
    address.suburb ||
    address.neighbourhood ||
    address.neighborhood ||
    address.quarter ||
    address.city_district ||
    address.district ||
    address.village ||
    address.hamlet ||
    address.town ||
    address.city ||
    address.municipality ||
    address.county ||
    null;

  if (!primary?.trim()) {
    // Fall back to first meaningful token of display_name ("Kilimani, Nairobi, …")
    const first = displayName?.split(',')[0]?.trim();
    return first || null;
  }

  const city = address.city || address.town || address.municipality || address.state || null;
  if (city && city.toLowerCase() !== primary.toLowerCase()) {
    return `${primary.trim()}, ${city.trim()}`;
  }
  return primary.trim();
}

async function geocodeGoogle(lat: number, lng: number, apiKey: string): Promise<string | null> {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(`${lat},${lng}`)}` +
    `&key=${encodeURIComponent(apiKey)}&language=en&result_type=neighborhood|sublocality|locality|administrative_area_level_3`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    let res = await fetch(url, { signal: controller.signal });
    let body: any = await res.json().catch(() => null);

    // Broader query if result_type filter returned nothing
    if (!body?.results?.length) {
      const broad =
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(`${lat},${lng}`)}` +
        `&key=${encodeURIComponent(apiKey)}&language=en`;
      res = await fetch(broad, { signal: controller.signal });
      body = await res.json().catch(() => null);
    }

    if (body?.status && body.status !== 'OK' && body.status !== 'ZERO_RESULTS') {
      return null;
    }

    const result = body?.results?.[0];
    if (!result) return null;

    const fromComponents = pickGooglePlaceLabel(result.address_components ?? []);
    if (fromComponents) return fromComponents;

    // e.g. "Kilimani, Nairobi, Kenya"
    const formatted = String(result.formatted_address || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (formatted.length >= 2) return `${formatted[0]}, ${formatted[1]}`;
    return formatted[0] || null;
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeNominatim(lat: number, lng: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}` +
      `&lon=${encodeURIComponent(String(lng))}&zoom=16&addressdetails=1`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'NMS-EOC/1.0 (ambulance-dispatch; nms@local)',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body: any = await res.json();
    return pickNominatimLabel(body?.address ?? {}, body?.display_name);
  } finally {
    clearTimeout(timer);
  }
}

export async function reverseGeocodePlace(
  lat: number,
  lng: number,
  googleMapsKey?: string | null,
): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const key = (googleMapsKey || process.env.GOOGLE_MAPS_KEY || '').trim();
  if (key) {
    try {
      const google = await geocodeGoogle(lat, lng, key);
      if (google) return google;
    } catch {
      // fall through
    }
  }

  try {
    return await geocodeNominatim(lat, lng);
  } catch {
    return null;
  }
}
