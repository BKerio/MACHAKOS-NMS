import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DispatchService } from './dispatch.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

const assignRoles = [Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN];

export const dispatchRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const dispatchService = new DispatchService(app);

  app.addHook('preValidation', app.authenticate);

  /**
   * GET /dispatch/queue
   * All SUBMITTED incidents waiting for a dispatcher to claim.
   */
  app.get(
    '/queue',
    { preValidation: [requireRole(assignRoles)] },
    async (_request, reply) => {
      const queue = await dispatchService.getQueue();
      return reply.send({ ok: true, data: queue });
    }
  );

  /**
   * GET /dispatch/fleet-status
   * Real operational fleet breakdown (ready / dispatched / on-scene / returning / offline).
   */
  app.get(
    '/fleet-status',
    { preValidation: [requireRole(assignRoles)] },
    async (_request, reply) => {
      const status = await dispatchService.getFleetStatus();
      return reply.send({ ok: true, data: status });
    }
  );

  /**
   * POST /dispatch/assign-offline/:id
   * Dispatches an incident to a partner / offline ambulance (no GPS tracker,
   * no crew app). Records the unit on the incident instead of creating a Task.
   */
  app.post<{ Params: { id: string }; Body: { partnerAmbulanceId: string; notes?: string } }>(
    '/assign-offline/:id',
    { preValidation: [requireRole(assignRoles)] },
    async (request, reply) => {
      if (!request.body?.partnerAmbulanceId) {
        throw new BadRequestError('partnerAmbulanceId is required');
      }
      const incident = await dispatchService.assignOfflineAmbulance(
        request.params.id,
        { userId: request.user.userId, role: request.user.role },
        { partnerAmbulanceId: request.body.partnerAmbulanceId, notes: request.body.notes },
      );
      return reply.send({ ok: true, data: incident });
    }
  );

  /**
   * POST /dispatch/assign/:id
   * Dispatcher claims an incident and moves it to DISPATCH_HANDLING.
   */
  app.post<{ Params: { id: string } }>(
    '/assign/:id',
    { preValidation: [requireRole(assignRoles)] },
    async (request, reply) => {
      const incident = await dispatchService.assignDispatcher(
        request.params.id,
        { userId: request.user.userId, role: request.user.role }
      );
      return reply.send({ ok: true, data: incident });
    }
  );

  /**
   * POST /dispatch/handoff/:id
   * Forward an incident to a partner agency.
   * Body: { toAgencyId, reason }
   */
  const handoffSchema = z.object({
    toAgencyId: z.string().uuid('Invalid agency ID'),
    reason: z.string().min(5, 'Please provide a reason for the handoff'),
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof handoffSchema> }>(
    '/handoff/:id',
    { preValidation: [requireRole(assignRoles)] },
    async (request, reply) => {
      const parsed = handoffSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError(parsed.error.issues[0].message);
      }

      const result = await dispatchService.handoffToPartner(
        request.params.id,
        { userId: request.user.userId, role: request.user.role, agencyId: request.user.agencyId },
        parsed.data
      );
      return reply.send({ ok: true, data: result });
    }
  );

  /**
   * GET /dispatch/vehicles
   * All vehicles with latest location - accessible to dispatchers for fleet map.
   */
  app.get(
    '/vehicles',
    { preValidation: [requireRole(assignRoles)] },
    async (_request, reply) => {
      const vehicles = await app.prisma.vehicle.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          agency:        { select: { id: true, name: true } },
          currentDriver: { select: { id: true, name: true, phone: true } },
          currentEmt:    { select: { id: true, name: true, phone: true } },
          currentNurse:  { select: { id: true, name: true, phone: true } },
        },
      });
      return reply.send({ ok: true, data: vehicles });
    }
  );

  /**
   * GET /dispatch/nearest-vehicles?lat=&lng=&limit=
   * Find nearest active vehicles to a coordinate.
   */
  app.get<{
    Querystring: { lat: string; lng: string; limit?: string };
  }>(
    '/nearest-vehicles',
    { preValidation: [requireRole(assignRoles)] },
    async (request, reply) => {
      const { lat, lng, limit } = request.query;

      if (!lat || !lng) throw new BadRequestError('lat and lng query params are required');

      const vehicles = await dispatchService.findNearestVehicles(
        parseFloat(lat),
        parseFloat(lng),
        request.user.agencyId,
        limit ? parseInt(limit, 10) : 5
      );

      return reply.send({ ok: true, data: vehicles });
    }
  );
};
