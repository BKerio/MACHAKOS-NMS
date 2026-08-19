/** Preset reasons when a responder ends a case before the normal workflow completes. */
export const CLOSURE_REASON_PRESETS = [
  'Patient Received',
  'Died on Scene',
  'Died on Transit',
  'Died on Arrival',
  'Patient refused treatment / transport',
  'Patient transferred to another facility',
  'Referral Declined',
  'Resolved on scene without transport',
  'False alarm - no emergency confirmed',
  'Duplicate case - merged with another incident',
  'Case handed off to partner agency',
  'Alert Terminated',
] as const;

export function buildClosureReason(preset: string, extraNote?: string): string {
  const note = extraNote?.trim();
  return note ? `${preset} — ${note}` : preset;
}

/** Preset reasons when a driver hands a live case to another crew. */
export const HANDOVER_REASON_PRESETS = [
  'Driver unable to continue — medical / personal',
  'Vehicle mechanical issue',
  'Crew fatigue / end of shift mid-case',
  'Escalation — higher-capability unit needed',
  'Conflict of interest / safety concern',
  'Other — see notes',
] as const;

export function buildHandoverReason(preset: string, extraNote?: string): string {
  const note = extraNote?.trim();
  return note ? `${preset} — ${note}` : preset;
}
