import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';

const gbvRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.DISPATCHER];

export const gbvRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preValidation', app.authenticate);
  app.addHook('preValidation', requireRole(gbvRoles));

  // List all GBV-flagged incidents
  app.get('/cases', async (_request, reply) => {
    const incidents = await app.prisma.incident.findMany({
      where: { isGbvCase: true },
      include: {
        watcher: { select: { id: true, name: true, phone: true } },
        dispatcher: { select: { id: true, name: true, phone: true } },
        gbvReport: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ ok: true, data: incidents });
  });

  // Flag an incident as a GBV case
  app.post<{ Params: { id: string } }>('/cases/:id/flag', async (request, reply) => {
    const incident = await app.prisma.incident.update({
      where: { id: request.params.id },
      data: { isGbvCase: true },
    });
    return reply.send({ ok: true, data: incident });
  });

  // Get the GBV report for one incident
  app.get<{ Params: { id: string } }>('/cases/:id/report', async (request, reply) => {
    const report = await app.prisma.gbvReport.findUnique({
      where: { incidentId: request.params.id },
    });
    return reply.send({ ok: true, data: report ?? null });
  });

  // Create or update the GBV report for an incident
  app.post<{
    Params: { id: string };
    Body: {
      survivorResidence?: string;
      hasDisability?: boolean;
      gbvTypes?: string[];
      violationLocation?: string;
      referredFor?: string[];
      referralFacility?: string;
      firstDisclosedTo?: string;
      challenges?: string;
      recommendations?: string;
      comment?: string;
    };
  }>('/cases/:id/report', async (request, reply) => {
    const {
      survivorResidence,
      hasDisability,
      gbvTypes,
      violationLocation,
      referredFor,
      referralFacility,
      firstDisclosedTo,
      challenges,
      recommendations,
      comment,
    } = request.body;

    const data = {
      survivorResidence: survivorResidence ?? null,
      hasDisability: hasDisability ?? null,
      gbvTypes: gbvTypes ?? [],
      violationLocation: violationLocation ?? null,
      referredFor: referredFor ?? [],
      referralFacility: referralFacility ?? null,
      firstDisclosedTo: firstDisclosedTo ?? null,
      challenges: challenges ?? null,
      recommendations: recommendations ?? null,
      comment: comment ?? null,
    };

    const report = await app.prisma.gbvReport.upsert({
      where: { incidentId: request.params.id },
      create: { incidentId: request.params.id, ...data },
      update: data,
    });

    return reply.status(201).send({ ok: true, data: report });
  });
};
