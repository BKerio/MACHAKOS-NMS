import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AdminService } from './admin.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { AgencyType, Role } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

const adminRoles = [Role.ADMIN, Role.SUPER_ADMIN];

// ── Schemas ──────────────────────────────────────────────────────────────────

const createUserSchema = z
  .object({
    email: z.string().email(),
    passwordRaw: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(2),
    role: z.nativeEnum(Role).optional(),
    roles: z
      .array(z.nativeEnum(Role))
      .min(1, 'Assign at least one role')
      .max(2, 'A user may hold at most 2 roles')
      .optional(),
    agencyId: z.string().min(1, 'Agency required'),
    phone: z.string().optional(),
  })
  .refine((data) => data.role || (data.roles && data.roles.length > 0), {
    message: 'Assign at least one role',
    path: ['roles'],
  });

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  phone: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  roles: z
    .array(z.nativeEnum(Role))
    .min(1, 'Assign at least one role')
    .max(2, 'A user may hold at most 2 roles')
    .optional(),
  isActive: z.boolean().optional(),
  agencyId: z.string().min(1).optional(),
});

const createVehicleSchema = z.object({
  registrationNumber: z.string().min(3, 'Registration number required'),
  imei: z.string().min(3, 'IMEI required'),
  agencyId: z.string().min(1, 'Agency required'),
});

const updateVehicleSchema = z.object({
  registrationNumber: z.string().min(3).optional(),
  imei: z.string().min(3).optional(),
  isActive: z.boolean().optional(),
});

const createAgencySchema = z.object({
  name: z.string().min(2),
  type: z.nativeEnum(AgencyType),
  location: z.string().optional(),
  contactInfo: z.record(z.string(), z.unknown()).optional(),
});

const updateAgencySchema = z.object({
  name: z.string().min(2).optional(),
  location: z.string().optional(),
  contactInfo: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

const partnerAmbulanceSchema = z.object({
  agencyId: z.string().min(1).optional().nullable(),
  registrationNumber: z.string().min(2, 'Registration number required'),
  vehicleType: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  baseLocation: z.string().optional(),
  capacity: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

const createFacilitySchema = z.object({
  name: z.string().min(2),
  type: z.string().min(2),
  kephLevel: z.number().int().min(1).max(6),
  subCounty: z.string().min(2),
  lat: z.number(),
  lng: z.number(),
});

const updateFacilitySchema = z.object({
  name: z.string().min(2).optional(),
  type: z.string().optional(),
  kephLevel: z.number().int().min(1).max(6).optional(),
  isActive: z.boolean().optional(),
});

const INVENTORY_CATEGORIES = [
  'VITALS',
  'CONSUMABLES',
  'MEDICATION',
  'AIRWAY',
  'WOUND_CARE',
  'OTHER',
] as const;

const createInventorySchema = z.object({
  name: z.string().min(2, 'Name required'),
  category: z.enum(INVENTORY_CATEGORIES),
  unit: z.string().min(1).optional(),
  quantityStock: z.number().int().min(0).optional(),
  reorderLevel: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

const updateInventorySchema = z.object({
  name: z.string().min(2).optional(),
  category: z.enum(INVENTORY_CATEGORIES).optional(),
  unit: z.string().min(1).optional(),
  quantityStock: z.number().int().min(0).optional(),
  reorderLevel: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// ── Helper ────────────────────────────────────────────────────────────────────

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestError(result.error.issues[0].message);
  return result.data;
}

// ── Routes ────────────────────────────────────────────────────────────────────

export const adminRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const adminService = new AdminService(app);

  app.addHook('preValidation', app.authenticate);
  app.addHook('preValidation', requireRole(adminRoles));

  // ── Users ──────────────────────────────────────────────────────────────────

  app.get<{ Querystring: { role?: Role; agencyId?: string; page?: string; limit?: string } }>(
    '/users',
    async (request, reply) => {
      const result = await adminService.listUsers({
        role: request.query.role,
        agencyId: request.query.agencyId,
        page: parseInt(request.query.page ?? '1', 10),
        limit: parseInt(request.query.limit ?? '20', 10),
      });
      return reply.send({ ok: true, ...result });
    }
  );

  app.get<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    const user = await adminService.getUserById(request.params.id);
    return reply.send({ ok: true, data: user });
  });

  app.post('/users', async (request, reply) => {
    const data = parse(createUserSchema, request.body);
    const user = await adminService.createUser(data);
    return reply.status(201).send({ ok: true, data: user });
  });

  app.patch<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    const data = parse(updateUserSchema, request.body);
    const user = await adminService.updateUser(request.params.id, data);
    return reply.send({ ok: true, data: user });
  });

  app.delete<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    await adminService.deleteUser(request.params.id, request.user.userId);
    return reply.send({ ok: true });
  });

  // ── Vehicles ───────────────────────────────────────────────────────────────

  app.get<{ Querystring: { agencyId?: string; page?: string; limit?: string } }>(
    '/vehicles',
    async (request, reply) => {
      const result = await adminService.listVehicles({
        agencyId: request.query.agencyId,
        page: parseInt(request.query.page ?? '1', 10),
        limit: parseInt(request.query.limit ?? '20', 10),
      });
      return reply.send({ ok: true, ...result });
    }
  );

  app.post('/vehicles', async (request, reply) => {
    const data = parse(createVehicleSchema, request.body);
    const vehicle = await adminService.createVehicle(data);
    return reply.status(201).send({ ok: true, data: vehicle });
  });

  app.patch<{ Params: { id: string } }>('/vehicles/:id', async (request, reply) => {
    const data = parse(updateVehicleSchema, request.body);
    const vehicle = await adminService.updateVehicle(request.params.id, data);
    return reply.send({ ok: true, data: vehicle });
  });

  // ── Agencies ───────────────────────────────────────────────────────────────

  app.get<{ Querystring: { type?: AgencyType } }>('/agencies', async (request, reply) => {
    const agencies = await adminService.listAgencies(request.query.type);
    return reply.send({ ok: true, data: agencies });
  });

  app.post('/agencies', async (request, reply) => {
    const data = parse(createAgencySchema, request.body);
    const agency = await adminService.createAgency(data);
    return reply.status(201).send({ ok: true, data: agency });
  });

  app.patch<{ Params: { id: string } }>('/agencies/:id', async (request, reply) => {
    const data = parse(updateAgencySchema, request.body);
    const agency = await adminService.updateAgency(request.params.id, data);
    return reply.send({ ok: true, data: agency });
  });

  // ── Facilities ─────────────────────────────────────────────────────────────

  app.get<{ Querystring: { subCounty?: string; kephLevel?: string } }>(
    '/facilities',
    async (request, reply) => {
      const facilities = await adminService.listFacilities({
        subCounty: request.query.subCounty,
        kephLevel: request.query.kephLevel ? parseInt(request.query.kephLevel, 10) : undefined,
      });
      return reply.send({ ok: true, data: facilities });
    }
  );

  app.post('/facilities', async (request, reply) => {
    const data = parse(createFacilitySchema, request.body);
    const facility = await adminService.createFacility(data);
    return reply.status(201).send({ ok: true, data: facility });
  });

  app.patch<{ Params: { id: string } }>('/facilities/:id', async (request, reply) => {
    const data = parse(updateFacilitySchema, request.body);
    const facility = await adminService.updateFacility(request.params.id, data);
    return reply.send({ ok: true, data: facility });
  });

  // ── Nature Options (admin CRUD) ────────────────────────────────────────────

  app.get('/nature-options', async (_request, reply) => {
    const options = await app.prisma.incidentNatureOption.findMany({
      orderBy: [{ nature: 'asc' }, { detail: 'asc' }],
    });
    return reply.send({ ok: true, data: options });
  });

  app.post<{ Body: { nature: string; detail?: string } }>('/nature-options', async (request, reply) => {
    const { nature, detail } = request.body;
    if (!nature?.trim()) throw new Error('Nature is required');
    const existing = await app.prisma.incidentNatureOption.findFirst({
      where: { nature, detail: detail ?? null },
    });
    if (existing) return reply.send({ ok: true, data: existing });
    // Append after existing options so admin-added entries don't jump to the top.
    const max = await app.prisma.incidentNatureOption.aggregate({ _max: { sortOrder: true } });
    const option = await app.prisma.incidentNatureOption.create({
      data: { nature, detail: detail ?? null, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
    return reply.status(201).send({ ok: true, data: option });
  });

  app.delete<{ Params: { id: string } }>('/nature-options/:id', async (request, reply) => {
    await app.prisma.incidentNatureOption.delete({ where: { id: request.params.id } });
    return reply.send({ ok: true });
  });

  // ── Partner Ambulances (reference info only - no GPS trackers) ────────────────

  app.get('/partner-ambulances', async (_request, reply) => {
    const data = await app.prisma.partnerAmbulance.findMany({
      orderBy: [{ isActive: 'desc' }, { registrationNumber: 'asc' }],
      include: { agency: { select: { id: true, name: true } } },
    });
    return reply.send({ ok: true, data });
  });

  app.post<{ Body: unknown }>('/partner-ambulances', async (request, reply) => {
    const parsed = partnerAmbulanceSchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);
    const data = await app.prisma.partnerAmbulance.create({
      data: parsed.data,
      include: { agency: { select: { id: true, name: true } } },
    });
    return reply.status(201).send({ ok: true, data });
  });

  app.patch<{ Params: { id: string }; Body: unknown }>('/partner-ambulances/:id', async (request, reply) => {
    const parsed = partnerAmbulanceSchema.partial().safeParse(request.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);
    const data = await app.prisma.partnerAmbulance.update({
      where: { id: request.params.id },
      data: parsed.data,
      include: { agency: { select: { id: true, name: true } } },
    });
    return reply.send({ ok: true, data });
  });

  app.delete<{ Params: { id: string } }>('/partner-ambulances/:id', async (request, reply) => {
    await app.prisma.partnerAmbulance.delete({ where: { id: request.params.id } });
    return reply.send({ ok: true });
  });

  // ── Inventory (vitals equipment + stock) ────────────────────────────────────

  app.get<{ Querystring: { category?: string; search?: string } }>(
    '/inventory',
    async (request, reply) => {
      const items = await adminService.listInventory({
        category: request.query.category,
        search: request.query.search,
      });
      return reply.send({ ok: true, data: items });
    }
  );

  app.post('/inventory', async (request, reply) => {
    const data = parse(createInventorySchema, request.body);
    const item = await adminService.createInventoryItem(data);
    return reply.status(201).send({ ok: true, data: item });
  });

  app.patch<{ Params: { id: string } }>('/inventory/:id', async (request, reply) => {
    const data = parse(updateInventorySchema, request.body);
    const item = await adminService.updateInventoryItem(request.params.id, data);
    return reply.send({ ok: true, data: item });
  });

  app.delete<{ Params: { id: string } }>('/inventory/:id', async (request, reply) => {
    await adminService.deleteInventoryItem(request.params.id);
    return reply.send({ ok: true });
  });

  /** GET /admin/inventory/checkouts - stock currently held on crew ambulances. */
  app.get('/inventory/checkouts', async (_request, reply) => {
    const data = await adminService.listActiveCheckouts();
    return reply.send({ ok: true, data });
  });

  // ── System Report ──────────────────────────────────────────────────────────

  app.get('/system-report', async (_request, reply) => {
    const data = await adminService.getSystemReport();
    return reply.send({ ok: true, data });
  });

  // ── System Health ──────────────────────────────────────────────────────────

  app.get('/system-health', async (_request, reply) => {
    let redisStatus: 'online' | 'offline' = 'offline';
    try {
      if (app.redis) {
        await app.redis.ping();
        redisStatus = 'online';
      }
    } catch { /* ignore */ }

    let dbStatus: 'online' | 'offline' = 'offline';
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'online';
    } catch { /* ignore */ }

    const maintenanceMode = app.redis
      ? (await app.redis.get('system:maintenance_mode').catch(() => null)) === '1'
      : false;

    return reply.send({
      ok: true,
      data: {
        db: dbStatus,
        redis: redisStatus,
        gpsConfigured: !!app.config.UFFIZIO_USERNAME,
        pbxConfigured: !!app.config.YEASTAR_BASE_URL,
        maintenanceMode,
        checkedAt: new Date().toISOString(),
      },
    });
  });

  app.post<{ Body: { enabled: boolean } }>('/system-health/maintenance', async (request, reply) => {
    const { enabled } = request.body ?? {};
    if (typeof enabled !== 'boolean') throw new BadRequestError('enabled must be a boolean');

    if (app.redis) {
      if (enabled) {
        await app.redis.set('system:maintenance_mode', '1');
      } else {
        await app.redis.del('system:maintenance_mode');
      }
    }

    return reply.send({ ok: true, data: { maintenanceMode: enabled } });
  });

  // ── Audit Logs ─────────────────────────────────────────────────────────────

  app.get<{ Querystring: { page?: string; limit?: string; userId?: string; action?: string } }>(
    '/audit-logs',
    async (request, reply) => {
      const q = request.query;
      const page = Math.max(1, parseInt(q.page ?? '1', 10));
      const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? '50', 10)));
      const skip = (page - 1) * limit;
      const where: any = {};
      if (q.userId) where.userId = q.userId;
      if (q.action) where.action = q.action;

      const [logs, total] = await Promise.all([
        app.prisma.auditLog.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true, email: true } } },
        }),
        app.prisma.auditLog.count({ where }),
      ]);

      return reply.send({ ok: true, data: logs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    }
  );
};
