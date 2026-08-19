import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { registerEnv } from './config/env.js';
import prismaPlugin from './plugins/prisma.js';
import jwtPlugin from './plugins/jwt.js';
import redisPlugin from './plugins/redis.js';
import socketPlugin from './plugins/socketio.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { incidentRoutes } from './modules/incidents/incident.routes.js';
import { fleetRoutes } from './modules/fleet/fleet.routes.js';
import { taskRoutes } from './modules/tasks/task.routes.js';
import { pbxRoutes } from './modules/pbx/pbx.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { dispatchRoutes } from './modules/dispatch/dispatch.routes.js';
import { partnerRoutes } from './modules/partner/partner.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { handoffRoutes } from './modules/handoff/handoff.routes.js';
import { notificationsRoutes } from './modules/notifications/notifications.routes.js';
import { gbvRoutes } from './modules/gbv/gbv.routes.js';
import { presenceRoutes } from './modules/presence/presence.routes.js';
import { publicRoutes } from './modules/public/public.routes.js';
import { fuelRoutes } from './modules/fuel/fuel.routes.js';
import { inventoryRoutes } from './modules/inventory/inventory.routes.js';
import { TrackingService } from './modules/tracking/tracking.service.js';
import { smsRoutes } from './services/sms.routes.js';

/**
 * Builds and returns the configured Fastify application instance.
 * Separating app creation from server startup allows for clean testing.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify's default bodyLimit is 1 MB and it gates the WHOLE request before
    // the multipart parser runs - so without this, any upload over 1 MB fails
    // with HTTP 413 regardless of the multipart fileSize limit. Raised to an
    // effectively-unlimited 1 GB backstop so PCRs are never rejected for size.
    bodyLimit: 1024 * 1024 * 1024,
    // Pino logger - structured, high-performance (built into Fastify)
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // ── Environment validation - MUST be registered first ─────────────────────
  // This will throw and refuse to start if required vars are missing/invalid.
  await registerEnv(app);

  // ── Database & Cache ───────────────────────────────────────────────────────
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(socketPlugin);

  // ── Security ──────────────────────────────────────────────────────────────
  await app.register(helmet, {
    // Allow Swagger UI to function in development
    contentSecurityPolicy: app.config.NODE_ENV === 'production',
  });

  await app.register(jwtPlugin);

  await app.register(cors, {
    origin: app.config.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // ── Multipart uploads (PCR images/docs, check-in selfies, etc.) ─────────────
  // Pairs with the bodyLimit above - both must be raised or large uploads 413.
  // The 1 GB ceiling is only a runaway/disk-fill backstop; a real PCR or selfie
  // is nowhere near it.
  await app.register(multipart, {
    limits: {
      fileSize: 1024 * 1024 * 1024, // 1 GB - effectively unlimited for PCRs
      files: 1,
      fields: 20, // generous; check-in sends lat/lng, PCR sends an optional note
    },
  });

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/', async (_request, reply) => {
    return reply.send({ ok: true, service: 'NMS-EOC API', version: '1.0.0' });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.register(authRoutes, { prefix: '/auth' });
  app.register(incidentRoutes, { prefix: '/incidents' });
  app.register(fleetRoutes, { prefix: '/fleet' });
  app.register(taskRoutes, { prefix: '/tasks' });
  app.register(pbxRoutes, { prefix: '/pbx' });
  app.register(adminRoutes, { prefix: '/admin' });
  app.register(dispatchRoutes, { prefix: '/dispatch' });
  app.register(partnerRoutes, { prefix: '/partner' });
  app.register(analyticsRoutes, { prefix: '/analytics' });
  app.register(handoffRoutes, { prefix: '/handoff' });
  app.register(notificationsRoutes, { prefix: '/notifications' });
  app.register(gbvRoutes, { prefix: '/gbv' });
  app.register(smsRoutes, { prefix: '/sms' });
  app.register(presenceRoutes, { prefix: '/presence' });
  app.register(publicRoutes, { prefix: '/public' });
  app.register(fuelRoutes, { prefix: '/fuel' });
  app.register(inventoryRoutes, { prefix: '/inventory' });

  // ── GPS Tracking (Uffizio/Kimii) ──────────────────────────────────────────
  const trackingService = new TrackingService(app);
  // Shared so FuelService can reuse the same Uffizio auth code.
  app.decorate('tracking', trackingService);
  app.addHook('onReady', async () => { trackingService.start(); });
  app.addHook('onClose', async () => { trackingService.stop(); });

  return app;
}
