import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { InventoryService } from './inventory.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

const crewRoles = [Role.DRIVER, Role.EMT, Role.NURSE];

const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        quantity: z.number().int().positive(),
      })
    )
    .min(1, 'Cart is empty'),
});

const returnSchema = z.object({
  quantity: z.number().int().positive(),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestError(result.error.issues[0].message);
  return result.data;
}

/**
 * Crew "stock cart" - browse central inventory and check items out onto the
 * ambulance they're currently checked into, or return them.
 */
export const inventoryRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const inventoryService = new InventoryService(app);

  app.addHook('preValidation', app.authenticate);

  /** GET /inventory - active central stock available to add to a cart. */
  app.get('/', { preValidation: [requireRole(crewRoles)] }, async (_request, reply) => {
    const items = await inventoryService.listAvailable();
    return reply.send({ ok: true, data: items });
  });

  /** POST /inventory/checkout - take cart items onto the crew's current ambulance. */
  app.post('/checkout', { preValidation: [requireRole(crewRoles)] }, async (request, reply) => {
    const data = parse(checkoutSchema, request.body);
    const result = await inventoryService.checkout(request.user.userId, data.items);
    return reply.status(201).send({ ok: true, data: result });
  });

  /** GET /inventory/my - stock currently carried on the crew's ambulance. */
  app.get('/my', { preValidation: [requireRole(crewRoles)] }, async (request, reply) => {
    const data = await inventoryService.myStock(request.user.userId);
    return reply.send({ ok: true, data });
  });

  /** POST /inventory/checkouts/:id/return - return some/all of a checked-out quantity. */
  app.post<{ Params: { id: string } }>(
    '/checkouts/:id/return',
    { preValidation: [requireRole(crewRoles)] },
    async (request, reply) => {
      const data = parse(returnSchema, request.body);
      const result = await inventoryService.returnItem(request.user.userId, request.params.id, data.quantity);
      return reply.send({ ok: true, data: result });
    }
  );
};
