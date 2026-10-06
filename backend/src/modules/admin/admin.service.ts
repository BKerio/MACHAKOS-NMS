import { FastifyInstance } from 'fastify';
import { Prisma } from '../../generated/prisma/index.js';
import { AgencyType, Role } from '../../shared/types/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import { hashPassword } from '../../shared/utils/hash.js';
import { getChecklistSummary } from '../fleet/checklist.js';
import { isCrewComplete } from '../fleet/crew.js';

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
        email: data.email.trim().toLowerCase(), passwordHash, name: data.name,
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

  async listVehicles(filters: { agencyId?: string; page: number; limit: number; includeInactive?: boolean }) {
    const { agencyId, page, limit, includeInactive } = filters;
    const skip = (page - 1) * limit;
    const where: any = { ...(agencyId ? { agencyId } : {}), ...(includeInactive ? {} : { isActive: true }) };

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

    // Checklist readiness, surfaced here too so Fleet Management can show it
    // before a dispatcher tries to assign a case (see fleet/checklist.ts).
    const summaries = await Promise.all(vehicles.map((v) => getChecklistSummary(this.app.prisma, v.id)));
    const withChecklist = vehicles.map((v, i) => ({
      ...v,
      crewComplete: isCrewComplete(v),
      checklistComplete: summaries[i].complete,
      checklistConfirmed: summaries[i].confirmed,
      checklistTotal: summaries[i].totalRequired,
    }));

    return { data: withChecklist, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
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
    const [facilities, ratings] = await Promise.all([
      this.app.prisma.facility.findMany({ where, orderBy: { name: 'asc' } }),
      // Crew ratings after each case (1-5 stars), summarised per facility.
      this.app.prisma.facilityRating.groupBy({ by: ['facilityId'], _avg: { stars: true }, _count: { _all: true } }),
    ]);
    const byFacility = new Map(ratings.map((r) => [r.facilityId, r]));
    return facilities.map((f) => {
      const r = byFacility.get(f.id);
      return {
        ...f,
        ratingAverage: r?._avg.stars == null ? null : Math.round(r._avg.stars * 10) / 10,
        ratingCount: r?._count._all ?? 0,
      };
    });
  }

  async createFacility(data: {
    name: string; type: string; ownership?: 'PUBLIC' | 'PRIVATE'; kephLevel: number;
    subCounty: string; lat: number; lng: number;
  }) {
    return this.app.prisma.facility.create({ data });
  }

  async updateFacility(id: string, data: {
    name?: string; type?: string; ownership?: 'PUBLIC' | 'PRIVATE'; kephLevel?: number; isActive?: boolean;
    subCounty?: string; lat?: number; lng?: number;
  }) {
    const facility = await this.app.prisma.facility.findUnique({ where: { id } });
    if (!facility) throw new NotFoundError('Facility');
    return this.app.prisma.facility.update({ where: { id }, data });
  }

  async deleteFacility(id: string) {
    const facility = await this.app.prisma.facility.findUnique({ where: { id } });
    if (!facility) throw new NotFoundError('Facility');

    try {
      await this.app.prisma.facility.delete({ where: { id } });
    } catch (err) {
      // P2003 = foreign key constraint failed: incidents reference this facility
      // as a transport target, so permanent deletion would orphan that history.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictError(
          'This facility is referenced by existing incidents and cannot be permanently deleted. Deactivate it instead.'
        );
      }
      throw err;
    }
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
    itemType?: string;
    unit?: string;
    quantityStock?: number;
    reorderLevel?: number;
    requiredForDispatch?: boolean;
    notes?: string;
  }) {
    return this.app.prisma.inventoryItem.create({
      data: {
        name: data.name.trim(),
        category: data.category,
        itemType: data.itemType ?? 'MEDICAL',
        unit: data.unit?.trim() || 'each',
        quantityStock: data.quantityStock ?? 0,
        reorderLevel: data.reorderLevel ?? 0,
        requiredForDispatch: data.requiredForDispatch ?? true,
        notes: data.notes?.trim() || undefined,
      },
    });
  }

  async updateInventoryItem(
    id: string,
    data: {
      name?: string;
      category?: string;
      itemType?: string;
      unit?: string;
      quantityStock?: number;
      reorderLevel?: number;
      requiredForDispatch?: boolean;
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

  // ── System Report: record-level detail for the Excel export ────────────────
  //
  // Every case, task, user, vehicle, facility and stock item. Contact and ID
  // fields are masked here, so full phone numbers, emails and ID numbers never
  // leave the server in the export. Password hashes are never selected.

  async getSystemReportDetails() {
    const person = { select: { name: true, role: true } } as const;
    const [incidents, tasks, users, vehicles, facilities, inventory, distance] = await Promise.all([
      this.app.prisma.incident.findMany({
        orderBy: { caseSeq: 'asc' },
        include: {
          watcher: person,
          dispatcher: person,
          assignedAgency: { select: { name: true } },
          targetFacility: { select: { name: true } },
          originFacility: { select: { name: true } },
          tasks: {
            orderBy: { receivedAt: 'desc' },
            take: 1,
            select: { status: true, vehicle: { select: { registrationNumber: true } } },
          },
          _count: { select: { tasks: true } },
        },
      }),
      this.app.prisma.task.findMany({
        orderBy: { receivedAt: 'asc' },
        include: {
          incident: { select: { caseNumber: true } },
          vehicle: { select: { registrationNumber: true } },
          driver: person,
          emt: person,
          nurse: person,
          emt2: person,
          nurse2: person,
          handoverBy: person,
        },
      }),
      this.app.prisma.user.findMany({
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        select: {
          name: true, email: true, phone: true, role: true, roles: true, isActive: true, createdAt: true,
          agency: { select: { name: true } },
          _count: {
            select: {
              watchedIncidents: true, dispatchedIncidents: true,
              driverTasks: true, emtTasks: true, nurseTasks: true, emt2Tasks: true, nurse2Tasks: true,
            },
          },
        },
      }),
      this.app.prisma.vehicle.findMany({
        orderBy: { registrationNumber: 'asc' },
        include: {
          agency: { select: { name: true } },
          currentDriver: person,
          currentEmt: person,
          currentNurse: person,
          currentEmt2: person,
          currentNurse2: person,
          _count: { select: { tasks: true } },
        },
      }),
      this.app.prisma.facility.findMany({
        orderBy: [{ ownership: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { incidents: true } } },
      }),
      this.app.prisma.inventoryItem.findMany({
        where: { isActive: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        select: { name: true, category: true, quantityStock: true, reorderLevel: true, unit: true },
      }),
      this.app.prisma.vehicleDistanceHour.groupBy({ by: ['vehicleId'], _sum: { distanceKm: true } }),
    ]);

    const [taskCounts, ratings] = await Promise.all([
      this.app.prisma.task.groupBy({ by: ['vehicleId', 'status'], _count: { id: true } }),
      this.app.prisma.facilityRating.groupBy({ by: ['facilityId'], _avg: { stars: true }, _count: { _all: true } }),
    ]);

    const plate = { select: { registrationNumber: true } } as const;
    const caseOfTask = { select: { incident: { select: { caseNumber: true } } } } as const;
    const [
      checkIns, standbys, checkouts, checklist, ratingRows, pcrs, calls, audit, subCounties,
    ] = await Promise.all([
      this.app.prisma.checkIn.findMany({
        orderBy: { checkedInAt: 'desc' },
        take: 5000,
        include: { user: person, vehicle: plate },
      }),
      this.app.prisma.standbyDeployment.findMany({ orderBy: { startedAt: 'desc' }, include: { vehicle: plate } }),
      this.app.prisma.inventoryCheckout.findMany({
        orderBy: { checkedOutAt: 'desc' },
        take: 5000,
        include: { item: { select: { name: true, category: true, unit: true } }, user: person, vehicle: plate },
      }),
      this.app.prisma.vehicleChecklistCheck.findMany({
        orderBy: { checkedAt: 'desc' },
        include: { vehicle: plate, item: { select: { name: true, category: true } }, checkedBy: person },
      }),
      this.app.prisma.facilityRating.findMany({
        orderBy: { createdAt: 'desc' },
        include: { facility: { select: { name: true } }, user: person, task: caseOfTask },
      }),
      this.app.prisma.patientCareReport.findMany({
        orderBy: { createdAt: 'desc' },
        include: { uploader: person, task: caseOfTask },
      }),
      this.app.prisma.callLog.findMany({
        orderBy: { startedAt: 'desc' },
        take: 5000,
        include: { incident: { select: { caseNumber: true } } },
      }),
      this.app.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 5000, include: { user: person } }),
      this.app.prisma.subCounty.findMany({ orderBy: { sortOrder: 'asc' }, select: { name: true } }),
    ]);
    const kmByVehicle = new Map(distance.map((d) => [d.vehicleId, d._sum.distanceKm ?? 0]));
    const completedByVehicle = new Map(
      taskCounts.filter((t) => t.status === 'COMPLETED').map((t) => [t.vehicleId, t._count.id])
    );
    const ratingByFacility = new Map(ratings.map((r) => [r.facilityId, r]));

    const minutes = (from?: Date | null, to?: Date | null) =>
      from && to ? Math.round(((to.getTime() - from.getTime()) / 60_000) * 10) / 10 : null;
    const crew = (...people: ({ name: string } | null)[]) => people.filter(Boolean).map((p) => p!.name).join(', ');

    return {
      cases: incidents.map((i) => ({
        caseNumber: i.caseNumber,
        status: i.status,
        incidentType: i.incidentType,
        originFacility: i.originFacility?.name ?? null,
        patientUnknown: i.patientUnknown,
        patientDescription: i.patientDescription,
        createdAt: i.createdAt,
        alertAt: i.alertAt,
        alertMode: i.alertMode,
        originOfAlert: i.originOfAlert,
        nature: i.alertNature,
        natureDetail: i.alertNatureDetail,
        chiefComplaint: i.chiefComplaint,
        location: i.locationName,
        subCounty: i.subCounty,
        lat: i.lat,
        lng: i.lng,
        massCasualty: i.massCasualty,
        massCasualtyCount: i.massCasualtyCount,
        gbv: i.isGbvCase,
        patientName: i.patientName,
        patientAge: i.patientAge,
        patientGender: i.patientGender,
        patientContact: maskPhone(i.patientContact),
        patientNationalId: maskId(i.patientNationalId),
        patientNhif: maskId(i.patientNhif),
        nextOfKin: i.nextOfKin,
        nextOfKinPhone: maskPhone(i.nextOfKinPhone),
        vitals: flattenJson(i.vitals),
        maternityVitals: flattenJson(i.maternityVitals),
        preHospitalManagement: i.preHospitalManagement,
        hospitalLevelRequired: i.hospitalLevelRequired,
        targetFacility: i.targetFacility?.name ?? null,
        placeOfReferral: i.placeOfReferral,
        ambulanceUsed: i.ambulanceUsed,
        latestVehicle: i.tasks[0]?.vehicle.registrationNumber ?? null,
        latestTaskStatus: i.tasks[0]?.status ?? null,
        taskCount: i._count.tasks,
        watcher: i.watcher.name,
        dispatcher: i.dispatcher?.name ?? null,
        agency: i.assignedAgency.name,
        healthcareWorker: i.healthcareWorkerName,
        watcherComments: i.watcherComments,
        dispatcherComments: i.dispatcherComments,
        dispatcherChallenges: i.dispatcherChallenges,
        surveillanceNote: i.surveillanceNote,
        partnerNotes: i.partnerNotes,
        closureReason: i.closureReason,
        updatedAt: i.updatedAt,
      })),
      tasks: tasks.map((t) => ({
        caseNumber: t.incident.caseNumber,
        vehicle: t.vehicle.registrationNumber,
        status: t.status,
        driver: t.driver.name,
        medics: crew(t.emt, t.nurse, t.emt2, t.nurse2),
        receivedAt: t.receivedAt,
        acceptedAt: t.acceptedAt,
        sceneArrivalAt: t.sceneArrivalAt,
        patientPickAt: t.patientPickAt,
        sceneDepartureAt: t.sceneDepartureAt,
        facilityArrivalAt: t.facilityArrivalAt,
        completedAt: t.completedAt,
        minToAccept: minutes(t.receivedAt, t.acceptedAt),
        minToScene: minutes(t.receivedAt, t.sceneArrivalAt),
        minOnScene: minutes(t.sceneArrivalAt, t.sceneDepartureAt),
        minToFacility: minutes(t.sceneDepartureAt, t.facilityArrivalAt),
        minTotal: minutes(t.receivedAt, t.completedAt),
        kmToScene: t.distanceToSceneKm,
        kmToFacility: t.sceneToFacilityKm,
        cancelledAt: t.cancelledAt,
        cancelReason: t.cancelReason,
        handedOverAt: t.handedOverAt,
        handoverReason: t.handoverReason,
        handoverBy: t.handoverBy?.name ?? null,
        handoverVitals: flattenJson(t.handoverVitals),
      })),
      users: users.map((u) => ({
        name: u.name,
        role: u.role,
        roles: u.roles.length ? u.roles.join(', ') : u.role,
        agency: u.agency.name,
        email: maskEmail(u.email),
        phone: maskPhone(u.phone),
        isActive: u.isActive,
        createdAt: u.createdAt,
        casesLogged: u._count.watchedIncidents,
        casesDispatched: u._count.dispatchedIncidents,
        crewTasks:
          u._count.driverTasks + u._count.emtTasks + u._count.nurseTasks + u._count.emt2Tasks + u._count.nurse2Tasks,
      })),
      fleet: vehicles.map((v) => ({
        plate: v.registrationNumber,
        agency: v.agency.name,
        status: v.status,
        isActive: v.isActive,
        trackerImei: maskId(v.imei),
        currentDriver: v.currentDriver?.name ?? null,
        currentMedics: crew(v.currentEmt, v.currentNurse, v.currentEmt2, v.currentNurse2),
        lastLocation: v.lastLocationName,
        lastSeenAt: v.lastLocationAt,
        fuelLitres: v.lastFuelLevelL,
        tasksTotal: v._count.tasks,
        tasksCompleted: completedByVehicle.get(v.id) ?? 0,
        distanceKm: Math.round((kmByVehicle.get(v.id) ?? 0) * 10) / 10,
      })),
      facilities: facilities.map((f) => {
        const r = ratingByFacility.get(f.id);
        return {
          name: f.name,
          type: f.type,
          ownership: f.ownership,
          kephLevel: f.kephLevel,
          subCounty: f.subCounty,
          isActive: f.isActive,
          casesReceived: f._count.incidents,
          ratingAverage: r?._avg.stars == null ? null : Math.round(r._avg.stars * 10) / 10,
          ratingCount: r?._count._all ?? 0,
          lat: f.lat,
          lng: f.lng,
        };
      }),
      inventory,
      officialSubCounties: subCounties.map((s) => s.name),
      checkIns: checkIns.map((c) => ({
        checkedInAt: c.checkedInAt,
        name: c.user.name,
        role: c.role,
        vehicle: c.vehicle.registrationNumber,
        location: c.locationName,
        locationMatch: c.locationMatch,
        distanceM: c.distanceM,
        accuracyM: c.accuracyM == null ? null : Math.round(c.accuracyM),
        mockLocation: c.mockLocation,
      })),
      standbys: standbys.map((s) => ({
        vehicle: s.vehicle.registrationNumber,
        title: s.title,
        location: s.location,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        minutes: minutes(s.startedAt, s.endedAt),
        notes: s.notes,
      })),
      checkouts: checkouts.map((c) => ({
        checkedOutAt: c.checkedOutAt,
        item: c.item.name,
        category: c.item.category,
        unit: c.item.unit,
        quantity: c.quantity,
        returned: c.returnedQuantity,
        status: c.status,
        returnedAt: c.returnedAt,
        by: c.user.name,
        vehicle: c.vehicle.registrationNumber,
      })),
      checklist: checklist.map((c) => ({
        checkedAt: c.checkedAt,
        vehicle: c.vehicle.registrationNumber,
        item: c.item.name,
        category: c.item.category,
        status: c.status,
        note: c.note,
        by: c.checkedBy.name,
      })),
      ratings: ratingRows.map((r) => ({
        createdAt: r.createdAt,
        facility: r.facility.name,
        stars: r.stars,
        tags: r.tags.join(', '),
        comment: r.comment,
        by: r.user.name,
        role: r.user.role,
        caseNumber: r.task.incident.caseNumber,
      })),
      pcrs: pcrs.map((p) => ({
        createdAt: p.createdAt,
        caseNumber: p.task.incident.caseNumber,
        uploader: p.uploader.name,
        mimeType: p.mimeType,
        sizeKb: Math.round(p.fileSize / 102.4) / 10,
        note: p.note || null,
      })),
      calls: calls.map((c) => ({
        startedAt: c.startedAt,
        direction: c.direction,
        status: c.status,
        from: maskPhone(c.callFrom),
        to: maskPhone(c.callTo),
        durationSec: c.duration,
        talkSec: c.talkDuration,
        caseNumber: c.incident?.caseNumber ?? null,
        trunk: c.trunkName,
        notes: c.notes,
      })),
      activity: audit.map((a) => ({
        at: a.createdAt,
        user: a.user.name,
        role: a.user.role,
        action: a.action,
        subject: a.subjectType,
        subjectId: a.subjectId.slice(0, 8),
        ip: maskIp(a.ipAddress),
      })),
    };
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

    // Case volume windows are counted from Nairobi midnight (UTC+3, no DST).
    const NAIROBI_MS = 3 * 3600_000;
    const now = Date.now();
    const todayStart = new Date(Math.floor((now + NAIROBI_MS) / 86_400_000) * 86_400_000 - NAIROBI_MS);
    const daysAgo = (n: number) => new Date(todayStart.getTime() - (n - 1) * 86_400_000);

    const [
      incidentsToday,
      incidentsWeek,
      incidentsMonth,
      massCasualtyIncidents,
      gbvFlaggedIncidents,
      incidentsByGender,
      incidentsByMonth,
      taskTimes,
      facilities,
    ] = await Promise.all([
      this.app.prisma.incident.count({ where: { createdAt: { gte: todayStart } } }),
      this.app.prisma.incident.count({ where: { createdAt: { gte: daysAgo(7) } } }),
      this.app.prisma.incident.count({ where: { createdAt: { gte: daysAgo(30) } } }),
      this.app.prisma.incident.count({ where: { massCasualty: true } }),
      this.app.prisma.incident.count({ where: { isGbvCase: true } }),
      this.app.prisma.incident.groupBy({ by: ['patientGender'], _count: { id: true } }),
      // Last 6 months, Nairobi calendar months.
      this.app.prisma.$queryRaw<Array<{ month: string; total: bigint; resolved: bigint }>>`
        SELECT to_char(date_trunc('month', created_at + interval '3 hours'), 'YYYY-MM') AS month,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'RESOLVED') AS resolved
        FROM incidents
        WHERE created_at >= date_trunc('month', now() + interval '3 hours') - interval '5 months' - interval '3 hours'
        GROUP BY 1 ORDER BY 1`,
      // Averages in minutes; AVG skips tasks missing a timestamp.
      this.app.prisma.$queryRaw<Array<{
        accept_min: number | null; response_min: number | null; cycle_min: number | null;
        total_km: number | null; completed: bigint;
      }>>`
        SELECT AVG(EXTRACT(EPOCH FROM (accepted_at - received_at))) / 60      AS accept_min,
               AVG(EXTRACT(EPOCH FROM (scene_arrival_at - received_at))) / 60 AS response_min,
               AVG(EXTRACT(EPOCH FROM (completed_at - received_at))) / 60     AS cycle_min,
               SUM(COALESCE(distance_to_scene_km, 0) + COALESCE(scene_to_facility_km, 0)) AS total_km,
               COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed
        FROM tasks`,
      this.app.prisma.facility.findMany({
        select: { name: true, type: true, ownership: true, kephLevel: true, subCounty: true, isActive: true },
        orderBy: [{ ownership: 'asc' }, { name: 'asc' }],
      }),
    ]);

    const statusCount = (s: string) => incidentsByStatus.find((r) => r.status === s)?._count.id ?? 0;
    const resolved = statusCount('RESOLVED');
    const inProgress = statusCount('DISPATCHED');
    const pending = statusCount('SUBMITTED') + statusCount('DISPATCH_HANDLING') + statusCount('DISPATCH_ON_HOLD');
    const drafts = statusCount('DRAFT');
    const submitted = incidentsTotal - drafts;

    const tally = <T,>(rows: T[], key: (r: T) => string | number) => {
      const m = new Map<string | number, number>();
      for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
      return m;
    };
    const ownershipCounts = tally(facilities, (f) => f.ownership);
    const kephCounts = tally(facilities, (f) => f.kephLevel);
    const round1 = (n: number | null | undefined) => (n == null ? null : Math.round(Number(n) * 10) / 10);
    const t = taskTimes[0];

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
        publicFacilities: ownershipCounts.get('PUBLIC') ?? 0,
        privateFacilities: ownershipCounts.get('PRIVATE') ?? 0,
        activeFacilities: facilities.filter((f) => f.isActive).length,
      },
      // Case outcomes. Pending = waiting on dispatch (submitted, being handled, on hold);
      // in progress = crew dispatched; drafts are never-submitted watcher entries.
      caseSummary: {
        total: incidentsTotal,
        resolved,
        pending,
        inProgress,
        drafts,
        resolutionRate: submitted > 0 ? Math.round((resolved / submitted) * 1000) / 10 : 0,
        today: incidentsToday,
        last7Days: incidentsWeek,
        last30Days: incidentsMonth,
        massCasualty: massCasualtyIncidents,
        gbvFlagged: gbvFlaggedIncidents,
      },
      responseTimes: {
        avgAcceptMinutes: round1(t?.accept_min),
        avgResponseMinutes: round1(t?.response_min),
        avgCaseMinutes: round1(t?.cycle_min),
        totalDistanceKm: round1(t?.total_km) ?? 0,
        completedTasks: Number(t?.completed ?? 0),
      },
      incidentsByMonth: incidentsByMonth.map((r) => ({
        month: r.month,
        total: Number(r.total),
        resolved: Number(r.resolved),
      })),
      incidentsByGender: incidentsByGender
        .map((r) => ({ gender: r.patientGender?.trim() || 'Not recorded', count: r._count.id }))
        .sort((a, b) => b.count - a.count),
      facilitiesByOwnership: [
        { ownership: 'PUBLIC', count: ownershipCounts.get('PUBLIC') ?? 0 },
        { ownership: 'PRIVATE', count: ownershipCounts.get('PRIVATE') ?? 0 },
      ],
      facilitiesByKeph: [...kephCounts.entries()]
        .map(([level, count]) => ({ level: Number(level), count }))
        .sort((a, b) => a.level - b.level),
      facilityList: facilities,
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

// ── Masking for exported reports ─────────────────────────────────────────────
// Enough is kept to recognise a record ("07*****123", "ja***@gmail.com") without
// the export carrying a usable phone number, email or ID number.

function maskPhone(v?: string | null) {
  if (!v) return null;
  const d = v.replace(/\s+/g, '');
  if (d.length <= 5) return '*'.repeat(d.length);
  return `${d.slice(0, 2)}${'*'.repeat(d.length - 5)}${d.slice(-3)}`;
}

function maskEmail(v?: string | null) {
  if (!v) return null;
  const [user, domain] = v.split('@');
  if (!domain) return maskId(v);
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(3, user.length - 2))}@${domain}`;
}

/** 41.90.12.7 -> 41.90.*.*; IPv6 keeps its first two groups. */
function maskIp(v?: string | null) {
  if (!v) return null;
  if (v.includes('.')) return v.split('.').map((p, i) => (i < 2 ? p : '*')).join('.');
  return `${v.split(':').slice(0, 2).join(':')}:*`;
}

function maskId(v?: string | null) {
  if (!v) return null;
  if (v.length <= 4) return '*'.repeat(v.length);
  return `${'*'.repeat(v.length - 4)}${v.slice(-4)}`;
}

/** {"Pulse":"88","BP":"120/80"} -> "Pulse: 88; BP: 120/80" for a single readable cell. */
function flattenJson(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== 'object') return String(v);
  const parts = Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== null && x !== undefined && x !== '')
    .map(([k, x]) => `${prettyKey(k)}: ${typeof x === 'object' ? JSON.stringify(x) : String(x)}`);
  return parts.length ? parts.join('; ') : null;
}

const VITAL_LABELS: Record<string, string> = {
  bp: 'BP', gcs: 'GCS', spo2: 'SpO2', fh: 'FH', fhr: 'FHR', rbs: 'RBS',
  pulseRate: 'Pulse', respirationRate: 'Resp', temperature: 'Temp',
};

/** pulseRate -> "Pulse", bloodSugar -> "Blood sugar". */
function prettyKey(k: string) {
  if (VITAL_LABELS[k]) return VITAL_LABELS[k];
  const words = k.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
