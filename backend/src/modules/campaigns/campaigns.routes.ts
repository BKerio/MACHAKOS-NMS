import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Role } from '../../shared/types/index.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { BadRequestError } from '../../shared/errors/AppError.js';
import { PushSenderService } from '../notifications/push-sender.service.js';
import { crewInclude, vehicleCrewIds } from '../fleet/crew.js';

/**
 * Push campaigns: an admin sends a one-off notification ("New app update
 * available", "Briefing at 08:00") to every crew member, or only to the crew
 * on the ambulances they pick. Each send is written to the audit log
 * (action PUSH_CAMPAIGN), which doubles as the campaign history.
 */

const CREW_ROLES = [Role.DRIVER, Role.EMT, Role.NURSE];

const sendSchema = z
  .object({
    title: z.string().trim().min(3, 'Add a title (at least 3 characters)').max(65, 'Keep the title under 65 characters'),
    message: z.string().trim().min(3, 'Add a message').max(240, 'Keep the message under 240 characters'),
    audience: z.enum(['ALL_CREW', 'VEHICLES']),
    vehicleIds: z.array(z.string().min(1)).max(200).optional(),
  })
  .refine((d) => d.audience === 'ALL_CREW' || (d.vehicleIds?.length ?? 0) > 0, {
    message: 'Pick at least one ambulance',
    path: ['vehicleIds'],
  });

export const campaignRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const pushSender = new PushSenderService(app);

  app.addHook('preValidation', app.authenticate);
  app.addHook('preValidation', requireRole([Role.ADMIN, Role.SUPER_ADMIN]));

  /** Every crew account that can receive a campaign (active, crew role first or second). */
  async function allCrewIds(): Promise<string[]> {
    const users = await app.prisma.user.findMany({
      where: { isActive: true, OR: [{ role: { in: CREW_ROLES } }, { roles: { hasSome: CREW_ROLES } }] },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  /**
   * GET /campaigns/audience
   * What the page needs to pick an audience: each active ambulance with the
   * crew on it now, plus how many crew accounts and alert-enabled devices exist.
   */
  app.get('/audience', async (_request, reply) => {
    const [vehicles, crewIds] = await Promise.all([
      app.prisma.vehicle.findMany({
        where: { isActive: true },
        orderBy: { registrationNumber: 'asc' },
        include: crewInclude,
      }),
      allCrewIds(),
    ]);
    const devices = await app.prisma.pushToken.count({ where: { userId: { in: crewIds } } });
    return reply.send({
      ok: true,
      data: {
        allCrew: { users: crewIds.length, devices },
        vehicles: vehicles.map((v) => ({
          id: v.id,
          registrationNumber: v.registrationNumber,
          status: v.status,
          crew: [v.currentDriver, v.currentEmt, v.currentEmt2, v.currentNurse, v.currentNurse2]
            .filter((p): p is NonNullable<typeof p> => !!p)
            .map((p) => ({ id: p.id, name: p.name })),
        })),
      },
    });
  });

  /**
   * POST /campaigns { title, message, audience: ALL_CREW | VEHICLES, vehicleIds? }
   * Sends the push and logs it. Refuses plainly when push is off or nobody
   * would receive it, so the admin never thinks a message went out when it didn't.
   */
  app.post('/', async (request, reply) => {
    const parsed = sendSchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);
    const { title, message, audience } = parsed.data;

    let recipients: string[];
    let vehicleRegs: string[] = [];
    if (audience === 'ALL_CREW') {
      recipients = await allCrewIds();
    } else {
      const vehicles = await app.prisma.vehicle.findMany({ where: { id: { in: parsed.data.vehicleIds } } });
      vehicleRegs = vehicles.map((v) => v.registrationNumber);
      recipients = [...new Set(vehicles.flatMap((v) => vehicleCrewIds(v)))];
      if (recipients.length === 0) {
        throw new BadRequestError('Nobody is checked in to the ambulances you picked, so no one would receive it.');
      }
    }
    if (recipients.length === 0) throw new BadRequestError('There are no active crew accounts to send to.');

    const summary = await pushSender.sendToUsers(recipients, title, message, { type: 'CAMPAIGN' });
    if (!summary.gatewayActive) {
      throw new BadRequestError('Push notifications are switched off. Turn them on under Notifications → Push Notifications.');
    }

    const result = {
      title,
      message,
      audience,
      vehicleRegs,
      recipients: recipients.length,
      devices: summary.devices,
      sent: summary.sent,
      failed: summary.failed,
    };
    await app.prisma.auditLog.create({
      data: {
        userId: request.user.userId,
        action: 'PUSH_CAMPAIGN',
        subjectType: 'CAMPAIGN',
        subjectId: audience === 'ALL_CREW' ? 'ALL_CREW' : vehicleRegs.join(',').slice(0, 190),
        newValues: result,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      },
    });

    return reply.send({ ok: true, data: { ...result, errors: summary.errors.slice(0, 3) } });
  });

  /** GET /campaigns - the 50 most recent campaigns, newest first. */
  app.get('/', async (_request, reply) => {
    const rows = await app.prisma.auditLog.findMany({
      where: { action: 'PUSH_CAMPAIGN' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { name: true } } },
    });
    return reply.send({
      ok: true,
      data: rows.map((r) => ({ id: r.id, sentAt: r.createdAt, sentBy: r.user?.name ?? null, ...(r.newValues as object) })),
    });
  });
};
