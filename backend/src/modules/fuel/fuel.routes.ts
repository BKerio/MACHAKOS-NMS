import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { FuelService } from './fuel.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/AppError.js';

const viewRoles = [Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN];

export const fuelRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const fuelService = new FuelService(app);

  app.addHook('preValidation', app.authenticate);

  /**
   * GET /fuel/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Fleet-wide fuel summary: distance, consumption, mileage, fills and drains.
   */
  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/summary',
    { preValidation: [requireRole(viewRoles)] },
    async (request, reply) => {
      const { from, to } = request.query;
      if (!from || !to) throw new BadRequestError('from and to dates are required');
      const { rows, meta } = await fuelService.getSummary(from, to);
      return reply.send({ ok: true, data: rows, meta });
    }
  );

  /**
   * GET /fuel/events/:vehicleId?from=&to=
   * Individual fill/drain events for one vehicle - each with litres, location,
   * odometer and before/after tank level.
   */
  app.get<{ Params: { vehicleId: string }; Querystring: { from?: string; to?: string } }>(
    '/events/:vehicleId',
    { preValidation: [requireRole(viewRoles)] },
    async (request, reply) => {
      const { from, to } = request.query;
      if (!from || !to) throw new BadRequestError('from and to dates are required');

      const vehicle = await app.prisma.vehicle.findUnique({
        where: { id: request.params.vehicleId },
        select: { imei: true, registrationNumber: true },
      });
      if (!vehicle) throw new NotFoundError('Vehicle not found');
      if (!vehicle.imei) throw new BadRequestError('That vehicle has no tracker fitted');

      const { events, meta } = await fuelService.getEvents(vehicle.imei, from, to);
      return reply.send({
        ok: true,
        data: events,
        meta: { ...meta, registrationNumber: vehicle.registrationNumber },
      });
    }
  );
};
