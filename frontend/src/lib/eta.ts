/** Drive-time ETA as returned by /dispatch/vehicle-etas and /dispatch/incident-etas. */
export interface DriveEta {
  durationSecs: number | null;
  distanceKm: number | null;
  /** 'google' = road route with live traffic; 'estimate' = straight-line guess. */
  source: 'google' | 'estimate';
}

/** "4 min", "1 h 12 min"; prefixed "~" for straight-line estimates. */
export function formatEta(secs: number, estimate = false): string {
  const mins = Math.max(1, Math.round(secs / 60));
  const text = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
  return estimate ? `~${text}` : text;
}

export const etaTitle = (eta: DriveEta) =>
  eta.source === 'google' ? 'Driving time with current traffic (Google)' : 'Rough estimate from straight-line distance';
