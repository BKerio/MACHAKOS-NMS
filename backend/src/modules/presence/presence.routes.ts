import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';

const wallboardRoles = [Role.WATCHER, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN];
const allRoles = Object.values(Role);

export const presenceRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preValidation', app.authenticate);

  /**
   * GET /presence/online?roles=WATCHER,DISPATCHER
   * Snapshot of everyone with a live, authenticated socket connection right now.
   * Powers the call-centre wallboard's "on duty" panels. Omit `roles` for everyone.
   */
  app.get<{ Querystring: { roles?: string } }>(
    '/online',
    { preValidation: [requireRole(wallboardRoles)] },
    async (request, reply) => {
      const roles = request.query.roles
        ?.split(',')
        .map((r) => r.trim().toUpperCase())
        .filter((r): r is Role => (allRoles as string[]).includes(r));

      const data = app.presence.list(roles && roles.length ? roles : undefined);
      return reply.send({ ok: true, data });
    },
  );
};
