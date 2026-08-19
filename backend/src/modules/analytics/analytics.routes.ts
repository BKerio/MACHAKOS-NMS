import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AnalyticsService } from './analytics.service.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

export const analyticsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const analyticsService = new AnalyticsService(app);

  app.addHook('preValidation', app.authenticate);

  /**
   * GET /analytics?from=2026-01-01&to=2026-06-30
   * Accessible to all authenticated roles.
   */
  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/',
    async (request, reply) => {
      // Default: last 30 days
      const to = request.query.to ? new Date(request.query.to) : new Date();
      const from = request.query.from
        ? new Date(request.query.from)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        throw new BadRequestError('Invalid date range');
      }

      // Set to end of the "to" day
      to.setHours(23, 59, 59, 999);

      const data = await analyticsService.getAnalytics({ from, to });
      return reply.send({ ok: true, data });
    }
  );
};
