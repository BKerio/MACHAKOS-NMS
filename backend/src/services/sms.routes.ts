import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../shared/guards/requireRole.js';
import { Role } from '../shared/types/index.js';
import { BadRequestError } from '../shared/errors/AppError.js';
import { SmsGatewayService } from '../modules/settings/sms-gateway.service.js';

// Dispatchers send bulk SMS too (e.g. alerting callers); gateway settings stay admin-only elsewhere.
const smsRoles = [Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN];

const MAX_RECIPIENTS = 1000;

const sendSchema = z.object({
  message: z.string().trim().min(1, 'Message is required').max(918, 'Message is too long (6 SMS segments max)'),
  numbers: z.array(z.string()).min(1, 'At least one recipient number is required').max(MAX_RECIPIENTS, `At most ${MAX_RECIPIENTS} numbers per send`),
});

/**
 * Bulk SMS: sends a message to a list of numbers through the SMS gateways
 * (active first, then backups - see SmsGatewayService), and lists what was
 * sent recently.
 */
export const smsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const smsGateway = new SmsGatewayService(app);

  app.addHook('preValidation', app.authenticate);
  app.addHook('preValidation', requireRole(smsRoles));

  app.post('/send', async (request, reply) => {
    const parsed = sendSchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);

    if (!(await smsGateway.isEnabled())) {
      throw new BadRequestError('No SMS gateway is set up. Add one under Admin → SMS Gateway.');
    }

    const result = await smsGateway.sendMany(parsed.data.numbers, parsed.data.message, {
      category: 'MANUAL',
      sentById: request.user.userId,
    });
    return reply.send({ ok: true, data: result });
  });

  app.get<{ Querystring: { limit?: string } }>('/messages', async (request, reply) => {
    const data = await smsGateway.recent(Number(request.query.limit) || 50);
    return reply.send({ ok: true, data });
  });
};
