import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PartnerService } from './partner.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { IncidentStatus, Role } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

export const partnerRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const partnerService = new PartnerService(app);

  app.addHook('preValidation', app.authenticate);
  app.addHook('preValidation', requireRole([Role.PARTNER, Role.ADMIN, Role.SUPER_ADMIN]));

  /**
   * GET /partner/incidents
   * All incidents forwarded to this partner's agency.
   */
  app.get<{ Querystring: { page?: string; limit?: string } }>(
    '/incidents',
    async (request, reply) => {
      const result = await partnerService.getForwardedIncidents(
        request.user.agencyId,
        {
          page: parseInt(request.query.page ?? '1', 10),
          limit: parseInt(request.query.limit ?? '20', 10),
        }
      );
      return reply.send({ ok: true, ...result });
    }
  );

  /**
   * GET /partner/gbv-cases
   * GBV cases forwarded to this partner (same GBV dashboard view, partner-scoped).
   */
  app.get('/gbv-cases', async (request, reply) => {
    const cases = await partnerService.getForwardedGbvCases(request.user.agencyId);
    return reply.send({ ok: true, data: cases });
  });

  /**
   * GET /partner/incidents/:id
   */
  app.get<{ Params: { id: string } }>(
    '/incidents/:id',
    async (request, reply) => {
      const incident = await partnerService.getForwardedIncidentById(
        request.params.id,
        request.user.agencyId
      );
      return reply.send({ ok: true, data: incident });
    }
  );

  /**
   * POST /partner/incidents/:id/accept
   * Partner acknowledges and takes ownership of a forwarded incident.
   */
  app.post<{ Params: { id: string } }>(
    '/incidents/:id/accept',
    async (request, reply) => {
      const incident = await partnerService.acceptIncident(
        request.params.id,
        request.user.agencyId
      );
      return reply.send({ ok: true, data: incident });
    }
  );

  /**
   * PATCH /partner/incidents/:id/status
   * Partner updates incident status from their end.
   */
  const statusSchema = z.object({
    status: z.nativeEnum(IncidentStatus),
    comments: z.string().optional(),
  });

  app.patch<{ Params: { id: string } }>(
    '/incidents/:id/status',
    async (request, reply) => {
      const parsed = statusSchema.safeParse(request.body);
      if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);

      const incident = await partnerService.updateIncidentStatus(
        request.params.id,
        request.user.agencyId,
        parsed.data.status,
        parsed.data.comments
      );
      return reply.send({ ok: true, data: incident });
    }
  );

  /**
   * PATCH /partner/incidents/:id/update
   * Partner adds notes, PCR URL, and optionally changes status - all in one call.
   */
  const partnerUpdateSchema = z.object({
    notes: z.string().optional(),
    pcrUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    status: z.nativeEnum(IncidentStatus).optional(),
  });

  app.patch<{ Params: { id: string } }>(
    '/incidents/:id/update',
    async (request, reply) => {
      const parsed = partnerUpdateSchema.safeParse(request.body);
      if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);

      const incident = await partnerService.addPartnerUpdate(
        request.params.id,
        request.user.agencyId,
        {
          notes: parsed.data.notes,
          pcrUrl: parsed.data.pcrUrl || undefined,
          status: parsed.data.status,
        }
      );
      return reply.send({ ok: true, data: incident });
    }
  );

  /**
   * POST /partner/resource-request
   * Partner sends a resource request to all dispatchers/admins via socket.
   * No DB model - socket-only.
   */
  app.post(
    '/resource-request',
    async (request, reply) => {
      const parsed = z.object({
        message: z.string().min(5, 'Message must be at least 5 characters'),
        urgency: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
      }).safeParse(request.body);
      if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);

      const agency = await app.prisma.agency.findUnique({
        where: { id: request.user.agencyId },
        select: { id: true, name: true },
      });

      app.io
        .to(`role:${Role.DISPATCHER}`)
        .to(`role:${Role.ADMIN}`)
        .to(`role:${Role.SUPER_ADMIN}`)
        .emit('partner:resource-request', {
          agencyId: request.user.agencyId,
          agencyName: agency?.name,
          requestedById: request.user.userId,
          message: parsed.data.message,
          urgency: parsed.data.urgency,
          requestedAt: new Date().toISOString(),
        });

      return reply.send({ ok: true, message: 'Resource request sent to dispatch' });
    }
  );
};
