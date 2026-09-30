import { PrismaClient } from '../../generated/prisma/index.js';
import { TaskStatus, VehicleStatus } from '../../shared/types/index.js';
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
 * Every ambulance that can take a case right now, wherever it is - the single
 * bar for handover and transfer candidates. Readiness is decided first and
 * distance only orders the result, so a broken-down, busy or half-crewed unit
 * that happens to be nearby is never offered, and a ready unit further away is
 * never cut off by a "nearest N" limit.
 *
 * Ready means: active, status READY (not BUSY, not MAINTENANCE), a driver and
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
    },
    orderBy: { registrationNumber: 'asc' },
    include: crewInclude,
  });

  const crewed = candidates.filter(isCrewComplete);
  const checklists = await Promise.all(crewed.map((v) => getChecklistSummary(prisma, v.id)));
  return crewed.filter((_, i) => checklists[i].complete);
}
