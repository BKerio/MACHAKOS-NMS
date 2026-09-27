import type { Task, Vehicle } from '@/types/api';

/**
 * Crew rule (mirrors backend fleet/crew.ts): an ambulance is dispatch-ready
 * with a driver plus two medics in any mix - an EMT and a nurse, two EMTs, or
 * two nurses.
 */
export const MIN_MEDICS = 2;

type Person = { id?: string; name: string; phone?: string | null };
export type MedicRole = 'EMT' | 'Nurse';
export type Medic = { role: MedicRole; person: Person };

type VehicleCrew = Pick<Vehicle, 'currentDriver' | 'currentEmt' | 'currentEmt2' | 'currentNurse' | 'currentNurse2' | 'crewComplete'>;
type TaskCrew = Pick<Task, 'driver' | 'emt' | 'emt2' | 'nurse' | 'nurse2'>;

function present(entries: [MedicRole, Person | null | undefined][]): Medic[] {
  return entries.flatMap(([role, person]) => (person ? [{ role, person }] : []));
}

/** Medics on board, EMTs first. */
export function vehicleMedics(v: VehicleCrew): Medic[] {
  return present([
    ['EMT', v.currentEmt],
    ['EMT', v.currentEmt2],
    ['Nurse', v.currentNurse],
    ['Nurse', v.currentNurse2],
  ]);
}

export function taskMedics(t: TaskCrew): Medic[] {
  return present([
    ['EMT', t.emt],
    ['EMT', t.emt2],
    ['Nurse', t.nurse],
    ['Nurse', t.nurse2],
  ]);
}

/** Prefers the backend's flag when the payload carries it. */
export function isCrewComplete(v: VehicleCrew): boolean {
  return v.crewComplete ?? (!!v.currentDriver && vehicleMedics(v).length >= MIN_MEDICS);
}

/** Why a vehicle isn't crew-ready, or null when it is. */
export function crewShortfall(v: VehicleCrew): string | null {
  if (!v.currentDriver) return 'no driver';
  const missing = MIN_MEDICS - vehicleMedics(v).length;
  if (missing <= 0) return null;
  return `needs ${missing} more medic${missing === 1 ? '' : 's'}`;
}

/** e.g. " · EMT Jane · Nurse Ali" - appended after a driver's name in lists. */
export function medicsInline(v: VehicleCrew, separator = ' · '): string {
  return vehicleMedics(v)
    .map((m) => `${separator}${m.role} ${m.person.name}`)
    .join('');
}
