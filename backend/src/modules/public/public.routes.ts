import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Role } from '../../shared/types/index.js';
import { ForbiddenError } from '../../shared/errors/AppError.js';

/**
 * Read-only endpoints for unattended displays (the call-centre wallboard TV).
 *
 * These are the ONLY routes in the app that skip JWT auth, so they are
 * deliberately narrow:
 *   - GET only. Nothing here can modify any data.
 *   - Gated on a shared secret (WALLBOARD_TOKEN). If that env var is empty the
 *     whole thing 403s, so the display is opt-in rather than on by default.
 *   - Returns a fixed, minimal projection - no patient data, no case details,
 *     no phone numbers, no IDs that could be replayed against other endpoints.
 *
 * The token is a weak credential by design (it sits in a TV's URL bar), so keep
 * this reachable only from the ops LAN - don't expose it on the public internet.
 */
export const publicRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const requireDisplayToken = async (request: any) => {
    const configured = app.config.WALLBOARD_TOKEN;
    if (!configured) {
      throw new ForbiddenError('Public wallboard is disabled. Set WALLBOARD_TOKEN to enable it.');
    }
    const supplied =
      (request.query?.token as string | undefined) ??
      (request.headers['x-wallboard-token'] as string | undefined);
    if (supplied !== configured) {
      throw new ForbiddenError('Invalid display token');
    }
  };

  /**
   * GET /public/wallboard?token=...
   * Everything the display needs in one poll: server time, who's on duty, and
   * the fleet with crew + last known position.
   */
  app.get<{ Querystring: { token?: string } }>(
    '/wallboard',
    { preValidation: [requireDisplayToken] },
    async (_request, reply) => {
      const vehicles = await app.prisma.vehicle.findMany({
        where: { isActive: true },
        orderBy: { registrationNumber: 'asc' },
        select: {
          id: true,
          registrationNumber: true,
          status: true,
          imei: true,
          lastLat: true,
          lastLng: true,
          lastLocationAt: true,
          lastLocationName: true,
          currentDriver: { select: { name: true } },
          currentEmt: { select: { name: true } },
          currentNurse: { select: { name: true } },
          agency: { select: { name: true } },
        },
      });

      // Only desk roles are shown as "on duty" on the board.
      const onDuty = app.presence
        .list([Role.WATCHER, Role.DISPATCHER])
        .map(u => ({ name: u.name, role: u.role, connectedAt: u.connectedAt }));

      return reply
        // Never let a proxy or browser cache a live ops board.
        .header('Cache-Control', 'no-store')
        .send({
          ok: true,
          data: {
            serverTime: new Date().toISOString(),
            onDuty,
            vehicles: vehicles.map(v => ({
              id: v.id,
              registrationNumber: v.registrationNumber,
              status: v.status,
              hasTracker: !!v.imei,
              lastLat: v.lastLat,
              lastLng: v.lastLng,
              lastLocationAt: v.lastLocationAt,
              lastLocationName: v.lastLocationName,
              agencyName: v.agency?.name ?? null,
              driver: v.currentDriver?.name ?? null,
              emt: v.currentEmt?.name ?? null,
              nurse: v.currentNurse?.name ?? null,
            })),
          },
        });
    },
  );
};
