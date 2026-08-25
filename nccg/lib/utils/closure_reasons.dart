// Port of frontend/src/utils/closureReasons.ts - kept identical so a case
// closed from the phone reads the same in the web console's audit log.

/// Preset reasons when a responder ends a case before the normal workflow completes.
const List<String> closureReasonPresets = [
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
];

String buildClosureReason(String preset, [String? extraNote]) {
  final note = extraNote?.trim();
  return (note != null && note.isNotEmpty) ? '$preset - $note' : preset;
}

/// Preset reasons when a driver hands a live case to another crew.
const List<String> handoverReasonPresets = [
  'Driver unable to continue - medical / personal',
  'Vehicle mechanical issue',
  'Crew fatigue / end of shift mid-case',
  'Escalation - higher-capability unit needed',
  'Conflict of interest / safety concern',
  'Other - see notes',
];

String buildHandoverReason(String preset, [String? extraNote]) {
  final note = extraNote?.trim();
  return (note != null && note.isNotEmpty) ? '$preset - $note' : preset;
}
