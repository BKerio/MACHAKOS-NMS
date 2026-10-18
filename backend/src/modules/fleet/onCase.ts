import type { PrismaClient } from '../../generated/prisma/index.js';
import { TaskStatus, VehicleStatus } from '../../shared/types/index.js';

/** Task stages after which the ambulance is free again. */
const TERMINAL: TaskStatus[] = [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.HANDED_OVER];

/**
 * Ids of vehicles with an open task - the real test of "on a case". The
 * vehicle's BUSY flag is meant to mirror this, but it can drift, so anything
 * showing whether a unit is engaged should go by this set.
 */
export async function onCaseVehicleIds(prisma: PrismaClient): Promise<Set<string>> {
  const rows = await prisma.task.findMany({
    where: { status: { notIn: TERMINAL } },
    select: { vehicleId: true },
    distinct: ['vehicleId'],
  });
  return new Set(rows.map((r) => r.vehicleId));
}

/** The status to show for a unit: BUSY while it has an open task, else its own flag. */
export function effectiveStatus<S extends string>(vehicleId: string, status: S, onCase: Set<string>): S | 'BUSY' {
  return onCase.has(vehicleId) && status !== VehicleStatus.MAINTENANCE ? 'BUSY' : status;
}

/** Puts the BUSY flag back on any unit that is on a case but marked READY. */
export async function repairOnCaseStatus(prisma: PrismaClient, onCase: Set<string>): Promise<number> {
  if (onCase.size === 0) return 0;
  const { count } = await prisma.vehicle.updateMany({
    where: { id: { in: [...onCase] }, status: VehicleStatus.READY },
    data: { status: VehicleStatus.BUSY },
  });
  return count;
}
