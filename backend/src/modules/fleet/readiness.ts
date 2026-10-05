import { PrismaClient } from '../../generated/prisma/index.js';
import { TaskStatus, VehicleStatus } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';
import { getChecklistSummary } from './checklist.js';
import { crewInclude, isCrewComplete } from './crew.js';

/** Task states in which an ambulance is still committed to a case. */
const OPEN_TASK_STATES = [
  TaskStatus.PENDING,
  TaskStatus.ACCEPTED,
  TaskStatus.EN_ROUTE,
  TaskStatus.AT_SCENE,
  TaskStatus.PATIENT_PICKED,
  TaskStatus.EN_ROUTE_TO_FACILITY,
  TaskStatus.AT_HOSPITAL,
];

/**
 * The standby an ambulance is committed to, if any. A standby that hasn't
 * been ended - including one scheduled to start later - keeps the unit out
 * of dispatch: it is promised to that event.
 */
export function activeStandby(prisma: PrismaClient, vehicleId: string) {
  return prisma.standbyDeployment.findFirst({
    where: { vehicleId, endedAt: null },
    select: { id: true, title: true, location: true },
  });
}

/** Throws if the ambulance is on standby - used by every path that hands it a case. */
export async function assertNotOnStandby(prisma: PrismaClient, vehicleId: string, registrationNumber: string) {
  const standby = await activeStandby(prisma, vehicleId);
  if (standby) {
    throw new BadRequestError(
      `${registrationNumber} is on standby for "${standby.title}"${standby.location ? ` at ${standby.location}` : ''}. End the standby before assigning it a case.`,
    );
  }
}

/**
 * Every ambulance that can take a case right now, wherever it is - the single
 * bar for handover and transfer candidates. Readiness is decided first and
 * distance only orders the result, so a broken-down, busy or half-crewed unit
 * that happens to be nearby is never offered, and a ready unit further away is
 * never cut off by a "nearest N" limit.
 *
 * Ready means: active, status READY (not BUSY, not MAINTENANCE), not on standby, a driver and
 * two medics checked in, this shift's equipment checklist confirmed, and no
 * task still open on it (guards against a status left READY by mistake).
 */
export async function findReadyUnits(
  prisma: PrismaClient,
  filter: { agencyId: string; excludeVehicleId?: string },
) {
  const candidates = await prisma.vehicle.findMany({
    where: {
      agencyId: filter.agencyId,
      isActive: true,
      status: VehicleStatus.READY,
      currentDriverId: { not: null },
      ...(filter.excludeVehicleId ? { id: { not: filter.excludeVehicleId } } : {}),
      tasks: { none: { status: { in: OPEN_TASK_STATES } } },
      standbys: { none: { endedAt: null } },
    },
    orderBy: { registrationNumber: 'asc' },
    include: crewInclude,
  });

  const crewed = candidates.filter(isCrewComplete);
  const checklists = await Promise.all(crewed.map((v) => getChecklistSummary(prisma, v.id)));
  return crewed.filter((_, i) => checklists[i].complete);
}
