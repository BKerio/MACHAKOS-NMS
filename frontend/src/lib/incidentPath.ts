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
