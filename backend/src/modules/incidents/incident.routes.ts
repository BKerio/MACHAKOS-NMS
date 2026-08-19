import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { IncidentService } from './incident.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { IncidentStatus, Role } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

const createIncidentSchema = z.object({
  chiefComplaint: z.string().min(3, 'Chief complaint is required'),
  locationName: z.string().min(2, 'Location name is required'),
  subCounty: z.string().min(2, 'Sub-county is required'),
  subCountySource: z.enum(['AUTO', 'MANUAL']).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  alertMode: z.string().optional(),
  alertAt: z.string().optional(),
  notifierDetails: z.array(z.record(z.string(), z.string())).optional(),
  patientName: z.string().optional(),
  patientAge: z.string().optional(),
  patientGender: z.string().optional(),
  patientNhif: z.string().optional(),
  patientNationalId: z.string().optional(),
  patientContact: z.string().optional(),
  nextOfKin: z.string().optional(),
  nextOfKinPhone: z.string().optional(),
  massCasualty: z.boolean().optional(),
  massCasualtyCount: z.number().int().positive().optional(),
  watcherComments: z.string().optional(),
  preHospitalManagement: z.string().optional(),
  alertNature: z.string().optional(),
  alertNatureDetail: z.string().optional(),
  originOfAlert: z.string().optional(),
  placeOfReferral: z.string().optional(),
  ambulanceUsed: z.string().optional(),
  targetFacilityId: z.string().optional(),
  surveillanceNote: z.string().optional(),
  healthcareWorkerName: z.string().optional(),
  healthcareWorkerContact: z.string().optional(),
  isGbvCase: z.boolean().optional(),
  clientRef: z.string().min(8).max(100).optional(),
  vitals: z.object({
  temperature: z.string().optional(),
  pulseRate: z.string().optional(),
  respirationRate: z.string().optional(),
  bp: z.string().optional(),
  spo2: z.string().optional(),
  gcs: z.string().optional(),
  fh: z.string().optional(),
}).optional(),
  maternityVitals: z.record(z.string(), z.unknown()).optional(),
});

const updateIncidentSchema = z.object({
  chiefComplaint: z.string().min(3).optional(),
  locationName: z.string().min(2).optional(),
  subCounty: z.string().optional(),
  massCasualty: z.boolean().optional(),
  massCasualtyCount: z.number().int().positive().optional(),
  watcherComments: z.string().optional(),
  dispatcherComments: z.string().optional(),
  dispatcherChallenges: z.string().optional(),
  patientName: z.string().optional(),
  patientAge: z.string().optional(),
  patientGender: z.string().optional(),
  patientNhif: z.string().optional(),
  patientNationalId: z.string().optional(),
  patientContact: z.string().optional(),
  nextOfKin: z.string().optional(),
  nextOfKinPhone: z.string().optional(),
  alertNature: z.string().optional(),
  alertNatureDetail: z.string().optional(),
  placeOfReferral: z.string().optional(),
  targetFacilityId: z.string().optional().or(z.literal('')),
  hospitalLevelRequired: z.number().int().min(1).max(6).optional(),
  healthcareWorkerName: z.string().optional(),
  healthcareWorkerContact: z.string().optional(),
  preHospitalManagement: z.string().optional(),
  partnerNotes: z.string().optional(),
  vitals: z.object({
  temperature: z.string().optional(),
  pulseRate: z.string().optional(),
  respirationRate: z.string().optional(),
  bp: z.string().optional(),
  spo2: z.string().optional(),
  gcs: z.string().optional(),
  fh: z.string().optional(),
}).optional(),
  maternityVitals: z.record(z.string(), z.unknown()).optional(),
  pcrUrl: z.string().url('PCR URL must be a valid URL').optional().or(z.literal('')),
});

const updateStatusSchema = z
  .object({
    status: z.nativeEnum(IncidentStatus),
    comments: z.string().optional(),
  })
  .refine(
    (d) => d.status !== IncidentStatus.RESOLVED || (d.comments && d.comments.trim().length >= 5),
    { message: 'A resolution reason (minimum 5 characters) is required when resolving an incident', path: ['comments'] }
  );

export const incidentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const incidentService = new IncidentService(app);

  app.addHook('preValidation', app.authenticate);

  /**
   * POST /incidents
   */
  app.post(
    '/',
    { preValidation: [requireRole([Role.WATCHER, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const parsed = createIncidentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError(parsed.error.issues[0].message);
      }

      const incident = await incidentService.createIncident(
        { userId: request.user.userId, agencyId: request.user.agencyId, role: request.user.role },
        parsed.data
      );
      return reply.status(201).send({ ok: true, data: incident });
    }
  );

  /**
   * GET /incidents/facilities - list active facilities (accessible to all authenticated roles)
   */
  app.get<{ Querystring: { subCounty?: string } }>('/facilities', async (request, reply) => {
    const subCounty = request.query.subCounty?.trim();
    const facilities = await app.prisma.facility.findMany({
      where: {
        isActive: true,
        // Filter to the incident's political/administrative region when provided.
        ...(subCounty ? { subCounty: { equals: subCounty, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true, type: true, subCounty: true, kephLevel: true, lat: true, lng: true },
      orderBy: { name: 'asc' },
    });
    return reply.send({ ok: true, data: facilities });
  });

  /**
   * GET /incidents
   */
  app.get<{ Querystring: { status?: IncidentStatus; watcherId?: string; caseNumber?: string; search?: string; from?: string; to?: string; page?: string; limit?: string } }>(
    '/',
    async (request, reply) => {
      const page = request.query.page ? parseInt(request.query.page, 10) : 1;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;

      const result = await incidentService.getIncidents({
        status: request.query.status,
        watcherId: request.query.watcherId,
        caseNumber: request.query.caseNumber,
        search: request.query.search,
        from: request.query.from,
        to: request.query.to,
        page,
        limit,
      });
      return reply.send({ ok: true, ...result });
    }
  );

  /**
   * GET /incidents/export - EOC incident report as CSV (opens directly in Excel).
   * One row per alert, newest first, matching the legacy "EOC System" export columns.
   * Restricted to dispatch/command roles; supports optional status + date range.
   */
  app.get<{ Querystring: { status?: IncidentStatus; from?: string; to?: string } }>(
    '/export',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const incidents = await incidentService.getIncidentsForExport({
        status: request.query.status,
        from: request.query.from,
        to: request.query.to,
      });

      // All EOC timestamps are Nairobi wall-clock. The previous implementation
      // used d.getDate()/d.getHours(), which is the SERVER's local timezone -
      // on a UTC host every exported time was 3 hours behind the real one.
      const NBO = 'Africa/Nairobi';
      const partsOf = (d: Date) => {
        const p = new Intl.DateTimeFormat('en-GB', {
          timeZone: NBO,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(d);
        const get = (t: string) => p.find(x => x.type === t)?.value ?? '';
        return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour'), mm: get('minute') };
      };
      const asDate = (d: Date) => { const p = partsOf(d); return `${p.d}/${p.m}/${p.y}`; };
      // The legacy sheet's "Alert Time" column holds a full timestamp
      // (e.g. 2026-07-29T12:08), not just the clock time.
      const asStamp = (d: Date) => { const p = partsOf(d); return `${p.y}-${p.m}-${p.d}T${p.hh}:${p.mm}`; };
      // RFC-4180 escaping: wrap in quotes and double any embedded quotes.
      const cell = (v: unknown) => {
        const s = v == null ? '' : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const headers = [
        'No', 'Date', 'Alert Time', 'Nature of Alert', 'Incidence Location',
        'Referral Place', 'Ambulance used', 'Case Outcome',
      ];

      const lines = [headers.join(',')];
      incidents.forEach((inc, i) => {
        const when = inc.alertAt ?? inc.createdAt;
        const nature = [inc.alertNature, inc.alertNatureDetail].filter(Boolean).join(' - ');
        const referral = inc.targetFacility?.name ?? inc.placeOfReferral ?? '';
        // "Ambulance used": the free-text field is set both by offline/partner
        // dispatches and by manual entry; fall back to the tracked vehicle's
        // registration from the dispatched task when it's a GPS unit.
        const taskVehicle = inc.tasks?.find(t => t.vehicle?.registrationNumber)?.vehicle?.registrationNumber;
        const ambulance = inc.ambulanceUsed ?? taskVehicle ?? '';
        lines.push([
          i + 1,
          asDate(new Date(when)),
          asStamp(new Date(when)),
          nature,
          inc.locationName,
          referral,
          ambulance,
          inc.closureReason ?? '',
        ].map(cell).join(','));
      });

      // Prepend a UTF-8 BOM so Excel renders accented/special characters correctly.
      const csv = '﻿' + lines.join('\r\n');
      const stamp = asDate(new Date()).replace(/\//g, '-');
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="EOC_Incident_Report_${stamp}.csv"`)
        .send(csv);
    }
  );

  /**
   * GET /incidents/:id
   */
  app.get<{ Params: { id: string } }>(
    '/:id',
    async (request, reply) => {
      const incident = await incidentService.getIncidentById(request.params.id);
      return reply.send({ ok: true, data: incident });
    }
  );

  /**
   * GET /incidents/partner-agencies
   * Returns active partner agencies - used by dispatchers to populate the "Assign to Partner" dropdown.
   */
  app.get(
    '/partner-agencies',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (_request, reply) => {
      const agencies = await incidentService.getPartnerAgencies();
      return reply.send({ ok: true, data: agencies });
    }
  );

  /**
   * POST /incidents/:id/assign-partner
   */
  const assignPartnerSchema = z.object({
    partnerAgencyId: z.string().uuid(),
    reason: z.string().min(5, 'Please provide a reason for the assignment'),
  });

  app.post<{ Params: { id: string } }>(
    '/:id/assign-partner',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const parsed = assignPartnerSchema.safeParse(request.body);
      if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);

      const updated = await incidentService.assignToPartner(
        request.params.id,
        { userId: request.user.userId, role: request.user.role },
        parsed.data.partnerAgencyId,
        parsed.data.reason
      );
      return reply.send({ ok: true, data: updated });
    }
  );

  /**
   * POST /incidents/:id/escalate
   * Marks the incident as a Mass Casualty Incident and alerts all dispatchers.
   */
  const escalateSchema = z.object({
    massCasualtyCount: z.number().int().min(1, 'Casualty count must be at least 1'),
    notes: z.string().optional(),
  });

  app.post<{ Params: { id: string } }>(
    '/:id/escalate',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const parsed = escalateSchema.safeParse(request.body);
      if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);
      const updated = await incidentService.escalateIncident(
        request.params.id,
        { userId: request.user.userId, role: request.user.role },
        parsed.data.massCasualtyCount,
        parsed.data.notes
      );
      return reply.send({ ok: true, data: updated });
    }
  );

  /**
   * POST /incidents/:id/deescalate
   * Removes the MCI flag from an incident.
   */
  app.post<{ Params: { id: string } }>(
    '/:id/deescalate',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const updated = await incidentService.deescalateIncident(
        request.params.id,
        { userId: request.user.userId, role: request.user.role }
      );
      return reply.send({ ok: true, data: updated });
    }
  );

  /**
   * GET /incidents/:id/tat
   * Returns a step-by-step TAT breakdown for a single incident.
   */
  app.get<{ Params: { id: string } }>(
    '/:id/tat',
    async (request, reply) => {
      const tat = await incidentService.getIncidentTat(request.params.id);
      return reply.send({ ok: true, data: tat });
    }
  );

  /**
   * GET /incidents/:id/audit-log
   */
  app.get<{ Params: { id: string } }>(
    '/:id/audit-log',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const entries = await incidentService.getIncidentAuditLog(request.params.id);
      return reply.send({ ok: true, data: entries });
    }
  );

  /**
   * PATCH /incidents/:id
   */
  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const parsed = updateIncidentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError(parsed.error.issues[0].message);
      }

      const updated = await incidentService.updateIncident(
        request.params.id,
        { userId: request.user.userId, role: request.user.role },
        parsed.data
      );
      return reply.send({ ok: true, data: updated });
    }
  );

  /**
   * GET /incidents/nature-options
   * Returns the full nature → details taxonomy. Auto-seeds defaults on first call.
   */
  app.get('/nature-options', async (_request, reply) => {
    const options = await incidentService.getNatureOptions();
    return reply.send({ ok: true, data: options });
  });

  /**
   * POST /incidents/nature-options
   * Add a new nature or nature detail. Body: { nature, detail? }
   */
  const natureOptionSchema = z.object({
    nature: z.string().min(2, 'Nature must be at least 2 characters'),
    detail: z.string().min(2).optional(),
  });

  app.post('/nature-options', async (request, reply) => {
    const parsed = natureOptionSchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);
    await incidentService.createNatureOption(parsed.data.nature, parsed.data.detail);
    const options = await incidentService.getNatureOptions();
    return reply.status(201).send({ ok: true, data: options });
  });

  /**
   * POST /incidents/:id/close
   * Any authenticated user can close a case - requires a mandatory reason.
   */
  const closeIncidentSchema = z.object({
    reason: z.string().min(10, 'Please provide a detailed reason (at least 10 characters)'),
  });

  app.post<{ Params: { id: string } }>(
    '/:id/close',
    async (request, reply) => {
      const parsed = closeIncidentSchema.safeParse(request.body);
      if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);

      const updated = await incidentService.closeIncident(
        request.params.id,
        { userId: request.user.userId, role: request.user.role },
        parsed.data.reason
      );
      return reply.send({ ok: true, data: updated });
    }
  );

  /**
   * PATCH /incidents/:id/status
   */
  app.patch<{ Params: { id: string } }>(
    '/:id/status',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const parsed = updateStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError(parsed.error.issues[0].message);
      }

      const updated = await incidentService.updateIncidentStatus(
        request.params.id,
        { userId: request.user.userId, role: request.user.role },
        parsed.data.status,
        parsed.data.comments
      );
      return reply.send({ ok: true, data: updated });
    }
  );
};
