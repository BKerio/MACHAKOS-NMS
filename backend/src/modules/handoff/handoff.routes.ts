import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { HandoffService } from './handoff.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';

const allowedRoles = [Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN];

export const handoffRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const handoffService = new HandoffService(app);

  app.addHook('preValidation', app.authenticate);

  app.get<{
    Querystring: { incidentId?: string; fromAgencyId?: string; toAgencyId?: string; page?: string; limit?: string };
  }>('/', { preValidation: [requireRole(allowedRoles)] }, async (request, reply) => {
    const q = request.query;
    const result = await handoffService.listLogs({
      incidentId: q.incidentId,
      fromAgencyId: q.fromAgencyId,
      toAgencyId: q.toAgencyId,
      page: Math.max(1, parseInt(q.page ?? '1', 10)),
      limit: Math.min(100, Math.max(1, parseInt(q.limit ?? '50', 10))),
    });
    return reply.send({ ok: true, ...result });
  });

  app.get<{ Params: { id: string } }>(
    '/:id',
    { preValidation: [requireRole(allowedRoles)] },
    async (request, reply) => {
      const log = await handoffService.getLogById(request.params.id);
      return reply.send({ ok: true, data: log });
    }
  );
};
