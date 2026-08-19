/** Builds the URL for the in-app map/navigation screen ('/operator/navigate'). */
export function inAppNavigateUrl(
  lat?: number | null,
  lng?: number | null,
  label?: string | null
): string | null {
  if (lat == null || lng == null) return null;
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (label) params.set('label', label);
  return `/operator/navigate?${params.toString()}`;
}
