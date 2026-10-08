/**
 * Readable case URLs: /incidents/case-021 instead of the database id.
 * The backend's GET /incidents/:id accepts either form, so old id links
 * (bookmarks, notifications) keep working.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isIncidentId = (s: string) => UUID.test(s);

/** "Case 021" -> "case-021"; null while a case still has its temporary number. */
export function caseSlug(caseNumber?: string | null): string | null {
  const m = /^case\s*(\d+)$/i.exec(caseNumber?.trim() ?? '');
  return m ? `case-${m[1]}` : null;
}

/** Detail-page path for a case, falling back to its id. */
export function incidentPath(incident: { id: string; caseNumber?: string | null }): string {
  return `/incidents/${caseSlug(incident.caseNumber) ?? incident.id}`;
}

type PatientIdentity = { patientUnknown?: boolean; unknownSeq?: number | null; patientGender?: string | null };

/**
 * "Unknown African Man 3" / "Unknown African Woman 3" for an unidentified
 * patient (also after they're identified), else null. Matches the backend.
 */
export function unknownLabel(i: PatientIdentity): string | null {
  if (i.unknownSeq == null) return null;
  const g = i.patientGender?.trim().toLowerCase();
  const who = g === 'male' ? 'Man' : g === 'female' ? 'Woman' : 'Person';
  return `Unknown African ${who} ${i.unknownSeq}`;
}

/** "Case 022 (Unknown African Man 1)" while unidentified, plain "Case 022" otherwise. */
export function caseTitle(i: PatientIdentity & { caseNumber: string }): string {
  const label = unknownLabel(i);
  return i.patientUnknown && label ? `${i.caseNumber} (${label})` : i.caseNumber;
}
