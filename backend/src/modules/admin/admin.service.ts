import { FastifyInstance } from 'fastify';
import { Prisma } from '../../generated/prisma/index.js';
import { AgencyType, Role } from '../../shared/types/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import { hashPassword } from '../../shared/utils/hash.js';

export class AdminService {
  constructor(private app: FastifyInstance) {}

  // ── Users ──────────────────────────────────────────────────────────────────

  async listUsers(filters: { role?: Role; agencyId?: string; page: number; limit: number }) {
    const { role, agencyId, page, limit } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (role) where.role = role;
    if (agencyId) where.agencyId = agencyId;

    const [users, total] = await Promise.all([
      this.app.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, email: true, phone: true, role: true, roles: true,
          isActive: true, agencyId: true, createdAt: true,
          agency: { select: { id: true, name: true } },
        },
      }),
      this.app.prisma.user.count({ where }),
    ]);

    return { data: users, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getUserById(id: string) {
    const user = await this.app.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, phone: true, role: true, roles: true,
        isActive: true, agencyId: true, createdAt: true,
        agency: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundError('User');
    return user;
  }

  async createUser(data: {
    email: string; passwordRaw: string; name: string; role?: Role; roles?: Role[];
    agencyId: string; phone?: string;
  }) {
    const existing = await this.app.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictError('A user with this email already exists');

    const agency = await this.app.prisma.agency.findUnique({ where: { id: data.agencyId } });
    if (!agency) throw new BadRequestError('Invalid agency ID');

    // A user may hold at most 2 roles (enforced in the route's zod schema too);
    // the first is the account's primary role.
    const roles = data.roles?.length ? data.roles : data.role ? [data.role] : [];
    if (!roles.length) throw new BadRequestError('Assign at least one role');

    const passwordHash = await hashPassword(data.passwordRaw);
    return this.app.prisma.user.create({
      data: {
        email: data.email, passwordHash, name: data.name,
        role: roles[0], roles, agencyId: data.agencyId, phone: data.phone,
      },
      select: { id: true, name: true, email: true, role: true, roles: true, agencyId: true, createdAt: true },
    });
  }

  async updateUser(
    id: string,
    data: {
      name?: string; email?: string; password?: string; phone?: string;
      role?: Role; roles?: Role[]; isActive?: boolean; agencyId?: string;
    }
  ) {
    const user = await this.app.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User');
    if (data.agencyId) {
      const agency = await this.app.prisma.agency.findUnique({ where: { id: data.agencyId } });
      if (!agency) throw new BadRequestError('Invalid agency ID');
    }
    if (data.email && data.email !== user.email) {
      const existing = await this.app.prisma.user.findUnique({ where: { email: data.email } });
      if (existing) throw new ConflictError('A user with this email already exists');
    }

    const { password, role, roles, ...rest } = data;
    // `roles` (multi-select) wins when present; a lone `role` (the single-role
    // edit form) collapses the account back down to that one role.
    const nextRoles = roles?.length ? roles : role ? [role] : undefined;

    return this.app.prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(nextRoles ? { role: nextRoles[0], roles: nextRoles } : {}),
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      },
      select: { id: true, name: true, email: true, phone: true, role: true, roles: true, isActive: true, agencyId: true },
    });
  }

  async deleteUser(id: string, requesterId: string) {
    if (id === requesterId) {
      throw new BadRequestError('You cannot delete your own account');
    }
    const user = await this.app.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User');

    try {
      await this.app.prisma.user.delete({ where: { id } });
    } catch (err) {
      // P2003 = foreign key constraint failed: the user has related records
      // (incidents watched/dispatched, tasks, vehicle assignments, PCRs, audit logs, etc.)
      // and permanent deletion would orphan operational history, so we refuse it.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictError(
          'This user has associated records (incidents, tasks, vehicle assignments, or audit history) and cannot be permanently deleted. Deactivate the account instead.'
        );
      }
      throw err;
    }
  }

  // ── Vehicles ───────────────────────────────────────────────────────────────

  async listVehicles(filters: { agencyId?: string; page: number; limit: number }) {
    const { agencyId, page, limit } = filters;
    const skip = (page - 1) * limit;
    const where: any = agencyId ? { agencyId } : {};

    const [vehicles, total] = await Promise.all([
      this.app.prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { agency: { select: { id: true, name: true } } },
      }),
      this.app.prisma.vehicle.count({ where }),
    ]);

    return { data: vehicles, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async createVehicle(data: { registrationNumber: string; imei: string; agencyId: string }) {
    const [existingReg, existingImei] = await Promise.all([
      this.app.prisma.vehicle.findUnique({ where: { registrationNumber: data.registrationNumber } }),
      this.app.prisma.vehicle.findUnique({ where: { imei: data.imei } }),
    ]);
    if (existingReg) throw new ConflictError('A vehicle with this registration already exists');
    if (existingImei) throw new ConflictError('A vehicle with this IMEI already exists');

    const agency = await this.app.prisma.agency.findUnique({ where: { id: data.agencyId } });
    if (!agency) throw new BadRequestError('Invalid agency ID');

    return this.app.prisma.vehicle.create({ data });
  }

  async updateVehicle(id: string, data: { registrationNumber?: string; imei?: string; isActive?: boolean }) {
    const vehicle = await this.app.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundError('Vehicle');
    return this.app.prisma.vehicle.update({ where: { id }, data });
  }

  // ── Agencies ───────────────────────────────────────────────────────────────

  async listAgencies(type?: AgencyType) {
    return this.app.prisma.agency.findMany({
      where: type ? { type } : {},
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true, vehicles: true } } },
    });
  }

  async createAgency(data: { name: string; type: AgencyType; location?: string; contactInfo?: object }) {
    return this.app.prisma.agency.create({ data });
  }

  async updateAgency(id: string, data: { name?: string; location?: string; contactInfo?: object; isActive?: boolean }) {
    const agency = await this.app.prisma.agency.findUnique({ where: { id } });
    if (!agency) throw new NotFoundError('Agency');
    return this.app.prisma.agency.update({ where: { id }, data });
  }

  // ── Facilities ─────────────────────────────────────────────────────────────

  async listFacilities(filters: { subCounty?: string; kephLevel?: number }) {
    const where: any = {};
    if (filters.subCounty) where.subCounty = filters.subCounty;
    if (filters.kephLevel) where.kephLevel = filters.kephLevel;
    return this.app.prisma.facility.findMany({ where, orderBy: { name: 'asc' } });
  }

  async createFacility(data: {
    name: string; type: string; kephLevel: number;
    subCounty: string; lat: number; lng: number;
  }) {
    return this.app.prisma.facility.create({ data });
  }

  async updateFacility(id: string, data: { name?: string; type?: string; kephLevel?: number; isActive?: boolean }) {
    const facility = await this.app.prisma.facility.findUnique({ where: { id } });
    if (!facility) throw new NotFoundError('Facility');
    return this.app.prisma.facility.update({ where: { id }, data });
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  async listInventory(filters: { category?: string; search?: string }) {
    const where: any = {};
    if (filters.category) where.category = filters.category;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { notes: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return this.app.prisma.inventoryItem.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async createInventoryItem(data: {
    name: string;
    category: string;
    unit?: string;
    quantityStock?: number;
    reorderLevel?: number;
    notes?: string;
  }) {
    return this.app.prisma.inventoryItem.create({
      data: {
        name: data.name.trim(),
        category: data.category,
        unit: data.unit?.trim() || 'each',
        quantityStock: data.quantityStock ?? 0,
        reorderLevel: data.reorderLevel ?? 0,
        notes: data.notes?.trim() || undefined,
      },
    });
  }

  async updateInventoryItem(
    id: string,
    data: {
      name?: string;
      category?: string;
      unit?: string;
      quantityStock?: number;
      reorderLevel?: number;
      notes?: string | null;
      isActive?: boolean;
    }
  ) {
    const item = await this.app.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundError('Inventory item');
    return this.app.prisma.inventoryItem.update({ where: { id }, data });
  }

  async deleteInventoryItem(id: string) {
    const item = await this.app.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundError('Inventory item');
    await this.app.prisma.inventoryItem.delete({ where: { id } });
  }

  /** Stock currently checked out to crew ambulances, for admin accountability. */
  async listActiveCheckouts() {
    return this.app.prisma.inventoryCheckout.findMany({
      where: { status: 'CHECKED_OUT' },
      include: {
        item: { select: { id: true, name: true, unit: true, category: true } },
        user: { select: { id: true, name: true, role: true } },
        vehicle: { select: { id: true, registrationNumber: true } },
      },
      orderBy: { checkedOutAt: 'desc' },
    });
  }

  // ── System Report (cross-module snapshot) ───────────────────────────────────

  async getSystemReport() {
    const [
      usersByRole,
      usersActive,
      usersTotal,
      incidentsByStatus,
      incidentsByNature,
      incidentsBySubCounty,
      incidentsTotal,
      vehiclesByStatus,
      vehiclesTotal,
      agenciesByType,
      agenciesTotal,
      facilitiesByType,
      facilitiesTotal,
      inventoryByCategory,
      inventoryItems,
      partnerAmbulancesTotal,
      partnerAmbulancesActive,
      tasksByStatus,
      gbvTotal,
      natureOptionsTotal,
    ] = await Promise.all([
      this.app.prisma.user.groupBy({
        by: ['role'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      this.app.prisma.user.groupBy({
        by: ['isActive'],
        _count: { id: true },
      }),
      this.app.prisma.user.count(),
      this.app.prisma.incident.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.app.prisma.incident.groupBy({
        by: ['alertNature'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 12,
      }),
      this.app.prisma.incident.groupBy({
        by: ['subCounty'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      this.app.prisma.incident.count(),
      this.app.prisma.vehicle.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.app.prisma.vehicle.count(),
      this.app.prisma.agency.groupBy({
        by: ['type'],
        _count: { id: true },
      }),
      this.app.prisma.agency.count(),
      this.app.prisma.facility.groupBy({
        by: ['type'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      this.app.prisma.facility.count(),
      this.app.prisma.inventoryItem.groupBy({
        by: ['category'],
        where: { isActive: true },
        _count: { id: true },
        _sum: { quantityStock: true },
      }),
      this.app.prisma.inventoryItem.findMany({
        where: { isActive: true },
        select: { name: true, category: true, quantityStock: true, reorderLevel: true, unit: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      this.app.prisma.partnerAmbulance.count(),
      this.app.prisma.partnerAmbulance.count({ where: { isActive: true } }),
      this.app.prisma.task.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.app.prisma.gbvReport.count(),
      this.app.prisma.incidentNatureOption.count(),
    ]);

    const lowStockItems = inventoryItems.filter(
      (i) => i.reorderLevel > 0 && i.quantityStock <= i.reorderLevel
    );

    const activeUsers = usersActive.find((u) => u.isActive)?._count.id ?? 0;
    const inactiveUsers = usersActive.find((u) => !u.isActive)?._count.id ?? 0;

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        users: usersTotal,
        activeUsers,
        inactiveUsers,
        incidents: incidentsTotal,
        vehicles: vehiclesTotal,
        agencies: agenciesTotal,
        facilities: facilitiesTotal,
        inventoryItems: inventoryItems.length,
        lowStockItems: lowStockItems.length,
        partnerAmbulances: partnerAmbulancesTotal,
        activePartnerAmbulances: partnerAmbulancesActive,
        gbvReports: gbvTotal,
        natureOptions: natureOptionsTotal,
        tasks: tasksByStatus.reduce((s, t) => s + t._count.id, 0),
      },
      usersByRole: usersByRole.map((r) => ({
        role: r.role,
        count: r._count.id,
      })),
      usersByStatus: [
        { status: 'Active', count: activeUsers },
        { status: 'Inactive', count: inactiveUsers },
      ],
      incidentsByStatus: incidentsByStatus.map((r) => ({
        status: r.status,
        count: r._count.id,
      })),
      incidentsByNature: incidentsByNature.map((r) => ({
        nature: r.alertNature || 'Unknown',
        count: r._count.id,
      })),
      incidentsBySubCounty: incidentsBySubCounty.map((r) => ({
        subCounty: r.subCounty || 'Unknown',
        count: r._count.id,
      })),
      vehiclesByStatus: vehiclesByStatus.map((r) => ({
        status: r.status,
        count: r._count.id,
      })),
      agenciesByType: agenciesByType.map((r) => ({
        type: r.type,
        count: r._count.id,
      })),
      facilitiesByType: facilitiesByType.map((r) => ({
        type: r.type,
        count: r._count.id,
      })),
      inventoryByCategory: inventoryByCategory.map((r) => ({
        category: r.category,
        items: r._count.id,
        stock: r._sum.quantityStock ?? 0,
      })),
      inventoryLowStock: lowStockItems.map((i) => ({
        name: i.name,
        category: i.category,
        quantityStock: i.quantityStock,
        reorderLevel: i.reorderLevel,
        unit: i.unit,
      })),
      tasksByStatus: tasksByStatus.map((r) => ({
        status: r.status,
        count: r._count.id,
      })),
    };
  }
}
