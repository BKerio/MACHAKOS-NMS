import { FastifyInstance } from 'fastify';
import { BadRequestError } from '../../shared/errors/AppError.js';

export class InventoryService {
  constructor(private app: FastifyInstance) {}

  /** Active central stock available to browse / add to a cart. */
  async listAvailable() {
    return this.app.prisma.inventoryItem.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * The ambulance the given user is currently checked into, regardless of
   * which crew slot (driver/EMT/nurse) they occupy. Checkout/return/my-stock
   * are all scoped to this vehicle so a crew shares one onboard stock list.
   */
  async getMyVehicle(userId: string) {
    const vehicle = await this.app.prisma.vehicle.findFirst({
      where: {
        isActive: true,
        OR: [{ currentDriverId: userId }, { currentEmtId: userId }, { currentNurseId: userId }],
      },
    });
    if (!vehicle) {
      throw new BadRequestError('You must be checked in to a vehicle to manage onboard stock');
    }
    return vehicle;
  }

  /**
   * Take stock from central inventory onto the crew's current ambulance.
   * The whole cart is applied in one transaction - if any line can't be
   * fulfilled, nothing is deducted.
   */
  async checkout(userId: string, items: { itemId: string; quantity: number }[]) {
    if (!items.length) throw new BadRequestError('Cart is empty');
    const vehicle = await this.getMyVehicle(userId);

    return this.app.prisma.$transaction(async (tx) => {
      const created = [];
      for (const line of items) {
        if (!line.quantity || line.quantity <= 0) {
          throw new BadRequestError('Quantity must be greater than zero');
        }
        const item = await tx.inventoryItem.findUnique({ where: { id: line.itemId } });
        if (!item || !item.isActive) throw new BadRequestError('Inventory item not found');
        if (item.quantityStock < line.quantity) {
          throw new BadRequestError(`Not enough stock for ${item.name} (only ${item.quantityStock} left)`);
        }
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { quantityStock: { decrement: line.quantity } },
        });
        const checkout = await tx.inventoryCheckout.create({
          data: {
            itemId: item.id,
            userId,
            vehicleId: vehicle.id,
            quantity: line.quantity,
          },
          include: { item: true },
        });
        created.push(checkout);
      }
      return created;
    });
  }

  /** Stock currently carried on the crew's ambulance (shared by driver/EMT/nurse). */
  async myStock(userId: string) {
    const vehicle = await this.getMyVehicle(userId);
    return this.app.prisma.inventoryCheckout.findMany({
      where: { vehicleId: vehicle.id, status: 'CHECKED_OUT' },
      include: { item: true, user: { select: { id: true, name: true, role: true } } },
      orderBy: { checkedOutAt: 'desc' },
    });
  }

  /** Return some/all of a checked-out quantity back to central stock. */
  async returnItem(userId: string, checkoutId: string, quantity: number) {
    if (!quantity || quantity <= 0) throw new BadRequestError('Quantity must be greater than zero');
    const vehicle = await this.getMyVehicle(userId);

    const checkout = await this.app.prisma.inventoryCheckout.findUnique({ where: { id: checkoutId } });
    if (!checkout || checkout.vehicleId !== vehicle.id) {
      throw new BadRequestError('Checkout not found on your ambulance');
    }
    const outstanding = checkout.quantity - checkout.returnedQuantity;
    if (quantity > outstanding) {
      throw new BadRequestError(`Only ${outstanding} outstanding for this item`);
    }

    return this.app.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id: checkout.itemId },
        data: { quantityStock: { increment: quantity } },
      });
      const returnedQuantity = checkout.returnedQuantity + quantity;
      const fullyReturned = returnedQuantity >= checkout.quantity;
      return tx.inventoryCheckout.update({
        where: { id: checkout.id },
        data: {
          returnedQuantity,
          status: fullyReturned ? 'RETURNED' : 'CHECKED_OUT',
          returnedAt: fullyReturned ? new Date() : null,
        },
        include: { item: true },
      });
    });
  }
}
