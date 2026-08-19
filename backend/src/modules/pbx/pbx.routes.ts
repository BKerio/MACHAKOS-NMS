import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PbxService } from './pbx.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/AppError.js';

export const pbxRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const pbxService = new PbxService(app);
  pbxService.start();
  app.addHook('onClose', async () => pbxService.stop());

  // ── PUBLIC: Webhook receiver (called by PBX hardware, not a user) ─────────
  // Authenticate via X-Yeastar-Secret header instead of JWT.
  // Configure this URL in: PBX > Settings > General > API > Application Server URL
  app.post('/webhook', async (request, reply) => {
    const secret = app.config.YEASTAR_WEBHOOK_SECRET;
    if (secret && request.headers['x-yeastar-secret'] !== secret) {
      return reply.status(401).send({ ok: false });
    }

    const body = request.body as any;
    // P-Series Cloud uses "event" field; S-Series legacy used "action"
    const event = body?.event ?? body?.action;

    try {
      if (event === 'NewCdr') {
        await pbxService.handleCdrPush(body);
      } else if (event === 'CallStatus') {
        pbxService.handleCallStatus(body);
      }
    } catch (err) {
      app.log.error({ err, event }, 'PBX webhook handler error');
    }

    return reply.send({ ok: true });
  });

  // ── PROTECTED routes - all require JWT + role ─────────────────────────────

  const dialSchema = z.object({
    extId: z.string().min(1, 'Extension ID is required'),
    outNumber: z.string().min(3, 'Phone number is required'),
    incidentId: z.string().uuid().optional(),
  });

  // Click-to-call: rings the dispatcher's extension first, then the outbound number
  app.post('/dial', {
    preValidation: [app.authenticate, requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])],
  }, async (request, reply) => {
    const parsed = dialSchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);

    const { extId, outNumber } = parsed.data;
    await pbxService.dialOutbound(extId, outNumber);
    return reply.send({ ok: true, message: 'Call initiated - your phone will ring first' });
  });

  // Active calls (in-memory, real-time)
  app.get('/active', {
    preValidation: [app.authenticate, requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])],
  }, async (_request, reply) => {
    return reply.send({ ok: true, data: pbxService.getActiveCalls() });
  });

  // CDR history from DB - paginated, filterable
  app.get('/cdr', {
    preValidation: [app.authenticate, requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])],
  }, async (request, reply) => {
    const q = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(q.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? '50', 10)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (q.direction) where.direction = q.direction;
    if (q.status) where.status = q.status;
    if (q.incidentId) where.incidentId = q.incidentId;
    if (q.from) where.startedAt = { gte: new Date(q.from) };
    if (q.to) where.startedAt = { ...(where.startedAt ?? {}), lte: new Date(q.to) };
    if (q.search) {
      where.OR = [
        { callFrom: { contains: q.search } },
        { callTo: { contains: q.search } },
      ];
    }
    if (q.unlinked === 'true') where.incidentId = null;

    const [total, records] = await Promise.all([
      app.prisma.callLog.count({ where }),
      app.prisma.callLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
        include: { incident: { select: { id: true, caseNumber: true } } },
      }),
    ]);

    return reply.send({ ok: true, data: records, total, page, limit, totalPages: Math.ceil(total / limit) });
  });

  // Link a call log to an incident
  app.patch('/cdr/:id/link', {
    preValidation: [app.authenticate, requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z.object({ incidentId: z.string().uuid() }).safeParse(request.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);

    const existing = await app.prisma.callLog.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Call log not found');

    const updated = await app.prisma.callLog.update({
      where: { id },
      data: { incidentId: parsed.data.incidentId },
      include: { incident: { select: { id: true, caseNumber: true } } },
    });
    return reply.send({ ok: true, data: updated });
  });

  // PBX health - connection state, active call count
  app.get('/health', {
    preValidation: [app.authenticate, requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])],
  }, async (_request, reply) => {
    return reply.send({ ok: true, data: pbxService.healthStatus() });
  });
};
