import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../shared/guards/requireRole.js';
import { Role } from '../shared/types/index.js';
import { BadRequestError } from '../shared/errors/AppError.js';
import { SmsGatewayService } from '../modules/settings/sms-gateway.service.js';
import { sendAdvantaSmsWithCreds, type AdvantaCreds } from './sms.js';

const smsRoles = [Role.ADMIN, Role.SUPER_ADMIN];

const sendSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  numbers: z.array(z.string()).min(1, 'At least one recipient number is required'),
});

/**
 * Bulk SMS route: sends a message to a manually-supplied list of numbers
 * through whichever gateway Admin → Bulk SMS → Gateway Settings has marked
 * active (see modules/settings/sms-gateway.service.ts). Distinct from the
 * env-based sendAdvantaSms used for system notifications like OTP.
 */
export const smsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const smsGateway = new SmsGatewayService(app);

  app.addHook('preValidation', app.authenticate);
  app.addHook('preValidation', requireRole(smsRoles));

  app.post('/send', async (request, reply) => {
    const parsed = sendSchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);
    const { message, numbers } = parsed.data;

    const active = await smsGateway.getActiveClient();
    if (!active) {
      throw new BadRequestError('No SMS gateway is configured. Set one up in Admin → Bulk SMS → Gateway Settings.');
    }

    let sent = 0;
    let failed = 0;
    const errors: { number: string; error: string }[] = [];
    for (const number of numbers) {
      try {
        await sendAdvantaSmsWithCreds(active.fields as unknown as AdvantaCreds, number, message);
        sent++;
      } catch (err: any) {
        failed++;
        const errorMessage = err?.message || 'Unknown error';
        errors.push({ number, error: errorMessage });
        app.log.warn({ err, number }, 'SMS send failed');
      }
    }

    return reply.send({ ok: true, data: { total: numbers.length, sent, failed, errors } });
  });
};
