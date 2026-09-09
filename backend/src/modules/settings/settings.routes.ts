import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role, SmsProvider } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';
import { SmsGatewayService } from './sms-gateway.service.js';

const settingsRoles = [Role.ADMIN, Role.SUPER_ADMIN];

const providerParamSchema = z.object({ provider: z.nativeEnum(SmsProvider) });
// Credential fields are provider-specific free-form strings (see
// PROVIDER_FIELDS in sms-provider-registry.ts) - validated loosely here,
// required-field enforcement happens in the service against that registry.
const fieldsBodySchema = z.record(z.string(), z.string());

/** Admin-only settings: currently just the Bulk SMS gateway configuration (see modules/settings/sms-gateway.service.ts). */
export const settingsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const smsGateway = new SmsGatewayService(app);

  app.addHook('preValidation', app.authenticate);
  app.addHook('preValidation', requireRole(settingsRoles));

  app.get('/sms-gateways', async (_request, reply) => {
    const data = await smsGateway.list();
    return reply.send({ ok: true, data });
  });

  app.put('/sms-gateways/:provider', async (request, reply) => {
    const params = providerParamSchema.safeParse(request.params);
    if (!params.success) throw new BadRequestError(params.error.issues[0].message);
    const body = fieldsBodySchema.safeParse(request.body);
    if (!body.success) throw new BadRequestError(body.error.issues[0].message);

    const data = await smsGateway.upsert(params.data.provider, body.data, request.user.userId);
    return reply.send({ ok: true, data });
  });

  app.post('/sms-gateways/:provider/activate', async (request, reply) => {
    const params = providerParamSchema.safeParse(request.params);
    if (!params.success) throw new BadRequestError(params.error.issues[0].message);

    const data = await smsGateway.setActive(params.data.provider, request.user.userId);
    return reply.send({ ok: true, data });
  });

  app.post('/sms-gateways/:provider/deactivate', async (request, reply) => {
    const params = providerParamSchema.safeParse(request.params);
    if (!params.success) throw new BadRequestError(params.error.issues[0].message);

    const data = await smsGateway.deactivate(params.data.provider, request.user.userId);
    return reply.send({ ok: true, data });
  });

  app.post('/sms-gateways/:provider/test', async (request, reply) => {
    const params = providerParamSchema.safeParse(request.params);
    if (!params.success) throw new BadRequestError(params.error.issues[0].message);

    const data = await smsGateway.testConnection(params.data.provider);
    return reply.send({ ok: true, data });
  });
};
