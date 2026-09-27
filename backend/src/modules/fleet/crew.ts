import { Prisma } from '../../generated/prisma/index.js';
import { Role } from '../../shared/types/index.js';

/**
 * Crew rule: an ambulance is dispatch-ready only with a driver plus two medics
 * in any mix - an EMT and a nurse, two EMTs, or two nurses. Each vehicle (and
 * task) therefore has two EMT slots and two nurse slots.
 */
export const MIN_MEDICS = 2;

export const EMT_SLOTS = ['currentEmtId', 'currentEmt2Id'] as const;
export const NURSE_SLOTS = ['currentNurseId', 'currentNurse2Id'] as const;
export const MEDIC_SLOTS = [...EMT_SLOTS, ...NURSE_SLOTS] as const;

export type CrewSlot = 'currentDriverId' | (typeof MEDIC_SLOTS)[number];

/** Vehicle slots a user of [role] may occupy, in fill order. */
export function slotsForRole(role: Role): readonly CrewSlot[] {
  if (role === Role.DRIVER) return ['currentDriverId'];
  if (role === Role.EMT) return EMT_SLOTS;
  if (role === Role.NURSE) return NURSE_SLOTS;
  return [];
}

const person = { select: { id: true, name: true, phone: true } } as const;

export const crewInclude = {
  currentDriver: person,
  currentEmt: person,
  currentEmt2: person,
  currentNurse: person,
  currentNurse2: person,
} satisfies Prisma.VehicleInclude;

export const taskCrewInclude = {
  driver: person,
  emt: person,
  emt2: person,
  nurse: person,
  nurse2: person,
} satisfies Prisma.TaskInclude;

type VehicleCrewIds = {
  currentDriverId: string | null;
  currentEmtId: string | null;
  currentEmt2Id: string | null;
  currentNurseId: string | null;
  currentNurse2Id: string | null;
};

type TaskCrewIds = {
  driverId: string;
  emtId: string | null;
  emt2Id: string | null;
  nurseId: string | null;
  nurse2Id: string | null;
};

/** Everyone checked in to the vehicle, driver first. */
export function vehicleCrewIds(v: VehicleCrewIds): string[] {
  return [v.currentDriverId, v.currentEmtId, v.currentEmt2Id, v.currentNurseId, v.currentNurse2Id].filter(
    (id): id is string => !!id
  );
}

export function medicCount(v: VehicleCrewIds): number {
  return MEDIC_SLOTS.filter((slot) => !!v[slot]).length;
}

export function isCrewComplete(v: VehicleCrewIds): boolean {
  return !!v.currentDriverId && medicCount(v) >= MIN_MEDICS;
}

/** Human-readable reason a vehicle can't be dispatched, or null if its crew is complete. */
export function crewIncompleteMessage(v: VehicleCrewIds): string | null {
  if (!v.currentDriverId) return 'No driver is checked in to this vehicle';
  const medics = medicCount(v);
  if (medics >= MIN_MEDICS) return null;
  return `Crew incomplete: needs two medics (an EMT and a nurse, two EMTs, or two nurses) - ${medics} on board`;
}

/** Everyone on a task's crew, driver first. */
export function taskCrewIds(t: TaskCrewIds): string[] {
  return [t.driverId, t.emtId, t.emt2Id, t.nurseId, t.nurse2Id].filter((id): id is string => !!id);
}

/** Copies a vehicle's current crew onto a new task's crew columns. */
export function taskCrewFromVehicle(v: VehicleCrewIds & { currentDriverId: string }) {
  return {
    driverId: v.currentDriverId,
    emtId: v.currentEmtId ?? undefined,
    emt2Id: v.currentEmt2Id ?? undefined,
    nurseId: v.currentNurseId ?? undefined,
    nurse2Id: v.currentNurse2Id ?? undefined,
  };
}

/** Prisma data that empties every crew slot. */
export const clearedCrew = {
  currentDriverId: null,
  currentEmtId: null,
  currentEmt2Id: null,
  currentNurseId: null,
  currentNurse2Id: null,
} as const;
