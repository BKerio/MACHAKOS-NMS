import type { Task, Vehicle } from '@/types/api';

/**
 * Crew rule (mirrors backend fleet/crew.ts): an ambulance is dispatch-ready
 * with a driver plus at least one medic, in any mix - one EMT, one nurse, two
 * EMTs, two nurses, or an EMT and a nurse. Up to four medic seats.
 */
export const MIN_MEDICS = 1;

/** The rule in words, for "can't dispatch yet" messages. */
export const CREW_RULE = 'a driver and at least one medic (an EMT or a nurse)';

/** "No medics" / "1 medic" / "3 medics". */
export const medicCountLabel = (n: number) => (n === 0 ? 'No medics' : `${n} medic${n === 1 ? '' : 's'}`);

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

/** "180 m" / "4.6 km" / "55 km". */
function formatMetres(m: number): string {
  if (m < 1000) return `${m} m`;
  const km = m / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/**
 * Warning when the current driver checked in away from this vehicle's GPS
 * tracker (or with a fake GPS app), else null. Informational only - it never
 * stops the vehicle from being dispatched.
 */
export function checkInLocationWarning(v: {
  checkInLocationMatch?: 'MATCHED' | 'MISMATCH' | 'UNVERIFIED' | null;
  checkInDistanceM?: number | null;
  checkInMockLocation?: boolean;
}): string | null {
  if (v.checkInMockLocation) return 'driver checked in with fake GPS';
  if (v.checkInLocationMatch !== 'MISMATCH') return null;
  return v.checkInDistanceM != null
    ? `driver checked in ${formatMetres(v.checkInDistanceM)} from the ambulance`
    : 'driver checked in away from the ambulance';
}
