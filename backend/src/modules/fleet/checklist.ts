import { PrismaClient } from '../../generated/prisma/index.js';
import { Role } from '../../shared/types/index.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors/AppError.js';

/**
 * Shared source of truth for "is this vehicle's pre-dispatch checklist
 * complete?" - used both by GET/POST /fleet/:vehicleId/checklist (fleet.routes.ts)
 * and by the dispatch-assignment gate (tasks/task.service.ts createTask/reassignTask),
 * plus the vehicle-list endpoints that surface readiness to dispatchers before
 * they attempt an assignment (dispatch.service.ts, admin.routes.ts GET /vehicles).
 *
 * A confirmation only counts if it happened at or after Vehicle.checklistResetAt
 * (bumped whenever a driver checks in - see fleet.service.ts checkInToCrew), so
 * a new shift always starts unconfirmed even though old check rows are kept
 * around (not deleted) for history.
 */
export interface ChecklistSummary {
  complete: boolean;
  totalRequired: number;
  confirmed: number;
}

export async function getChecklistSummary(prisma: PrismaClient, vehicleId: string): Promise<ChecklistSummary> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { checklistResetAt: true } });
  if (!vehicle) throw new NotFoundError('Vehicle not found');

  const totalRequired = await prisma.inventoryItem.count({
    where: { isActive: true, requiredForDispatch: true },
  });
  const confirmed = await prisma.vehicleChecklistCheck.count({
    where: {
      vehicleId,
      status: 'OK',
      checkedAt: { gte: vehicle.checklistResetAt },
      item: { isActive: true, requiredForDispatch: true },
    },
  });

  return { complete: totalRequired > 0 ? confirmed >= totalRequired : true, totalRequired, confirmed };
}

/** Full checklist for one vehicle: every active+required item plus its current (this-shift) state, if any. */
export async function getChecklistDetail(prisma: PrismaClient, vehicleId: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { checklistResetAt: true } });
  if (!vehicle) throw new NotFoundError('Vehicle not found');

  const [items, checks] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { isActive: true, requiredForDispatch: true },
      orderBy: [{ itemType: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    }),
    prisma.vehicleChecklistCheck.findMany({
      where: { vehicleId, checkedAt: { gte: vehicle.checklistResetAt } },
      include: { checkedBy: { select: { id: true, name: true } } },
    }),
  ]);

  const byItemId = new Map(checks.map((c) => [c.itemId, c]));
  const rows = items.map((item) => {
    const check = byItemId.get(item.id);
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      itemType: item.itemType,
      unit: item.unit,
      status: check?.status ?? null,
      note: check?.note ?? null,
      checkedAt: check?.checkedAt ?? null,
      checkedByName: check?.checkedBy.name ?? null,
    };
  });

  const confirmed = rows.filter((r) => r.status === 'OK').length;
  return {
    resetAt: vehicle.checklistResetAt,
    items: rows,
    summary: { complete: rows.length > 0 ? confirmed >= rows.length : true, totalRequired: rows.length, confirmed },
  };
}

/** Throws if [userId] isn't currently occupying one of the vehicle's crew slots. */
export async function assertCrewOnVehicle(prisma: PrismaClient, vehicleId: string, userId: string) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { currentDriverId: true, currentEmtId: true, currentNurseId: true },
  });
  if (!vehicle) throw new NotFoundError('Vehicle not found');
  const onCrew = [vehicle.currentDriverId, vehicle.currentEmtId, vehicle.currentNurseId].includes(userId);
  if (!onCrew) throw new ForbiddenError('You are not currently checked in to this vehicle');
}

/** Crew-only guard used by both checklist routes: DRIVER/EMT/NURSE must be on this vehicle's crew. */
export async function assertChecklistAccess(prisma: PrismaClient, vehicleId: string, actor: { userId: string; role: Role }) {
  const staffRoles: Role[] = [Role.DRIVER, Role.EMT, Role.NURSE];
  if (staffRoles.includes(actor.role)) {
    await assertCrewOnVehicle(prisma, vehicleId, actor.userId);
  }
  // DISPATCHER/ADMIN/SUPER_ADMIN get unconditional read access - enforced by the route's requireRole.
}

export async function upsertChecklistCheck(
  prisma: PrismaClient,
  vehicleId: string,
  actor: { userId: string; role: Role },
  data: { itemId: string; status: 'OK' | 'ISSUE'; note?: string },
) {
  await assertCrewOnVehicle(prisma, vehicleId, actor.userId);

  const item = await prisma.inventoryItem.findUnique({ where: { id: data.itemId } });
  if (!item || !item.isActive) throw new NotFoundError('Inventory item not found');

  return prisma.vehicleChecklistCheck.upsert({
    where: { vehicleId_itemId: { vehicleId, itemId: data.itemId } },
    create: {
      vehicleId,
      itemId: data.itemId,
      status: data.status,
      note: data.note,
      checkedById: actor.userId,
    },
    update: {
      status: data.status,
      note: data.note ?? null,
      checkedById: actor.userId,
      checkedAt: new Date(),
    },
  });
}
