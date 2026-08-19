import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { IncidentStatus, Role, TaskStatus, VehicleStatus } from '../../shared/types/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError.js';
import { NATURE_TAXONOMY } from './nature-taxonomy.js';

export class IncidentService {
  constructor(private app: FastifyInstance) {}

  /** Display form of the running case sequence, e.g. 1 -> "Case 001". */
  private formatCaseNumber(seq: number): string {
    return `Case ${String(seq).padStart(3, '0')}`;
  }

  private async writeAudit(opts: {
    userId: string;
    action: string;
    subjectId: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
  }) {
    await this.app.prisma.auditLog.create({
      data: {
        action: opts.action,
        subjectType: 'INCIDENT',
        subjectId: opts.subjectId,
        oldValues: (opts.oldValues ?? null) as any,
        newValues: (opts.newValues ?? null) as any,
        userId: opts.userId,
      },
    });
  }

  async createIncident(
    user: { userId: string; agencyId: string; role: Role },
    data: {
      chiefComplaint: string;
      locationName: string;
      subCounty: string;
      subCountySource?: 'AUTO' | 'MANUAL';
      clientRef?: string;
      lat?: number;
      lng?: number;
      alertMode?: string;
      alertAt?: string;
      notifierDetails?: Record<string, string>[];
      patientName?: string;
      patientAge?: string;
      patientGender?: string;
      patientNhif?: string;
      patientNationalId?: string;
      patientContact?: string;
      nextOfKin?: string;
      nextOfKinPhone?: string;
      massCasualty?: boolean;
      massCasualtyCount?: number;
      watcherComments?: string;
      preHospitalManagement?: string;
      alertNature?: string;
      alertNatureDetail?: string;
      originOfAlert?: string;
      placeOfReferral?: string;
      ambulanceUsed?: string;
      targetFacilityId?: string;
      surveillanceNote?: string;
      healthcareWorkerName?: string;
      healthcareWorkerContact?: string;
      isGbvCase?: boolean;
      vitals?: {
        temperature?: string;
        pulseRate?: string;
        respirationRate?: string;
        bp?: string;
        spo2?: string;
        gcs?: string;
        fh?: string;
      };
      maternityVitals?: Record<string, any>;
    }
  ) {
    const initialStatus = user.role === Role.WATCHER
      ? IncidentStatus.DRAFT
      : IncidentStatus.SUBMITTED;

    // Idempotent offline sync (#17): if this device already synced this capture,
    // return the existing incident instead of creating a duplicate.
    if (data.clientRef) {
      const existing = await this.app.prisma.incident.findUnique({ where: { clientRef: data.clientRef } });
      if (existing) return existing;
    }

    // Create with a unique placeholder, then set the human "Case NNN" from the
    // DB-assigned caseSeq - this is collision-free and always in ascending order.
    const created = await this.app.prisma.incident.create({
      data: {
        caseNumber: `PENDING-${randomUUID()}`,
        clientRef: data.clientRef,
        status: initialStatus,
        chiefComplaint: data.chiefComplaint,
        locationName: data.locationName,
        subCounty: data.subCounty,
        subCountySource: data.subCountySource,
        lat: data.lat,
        lng: data.lng,
        alertMode: data.alertMode,
        alertAt: data.alertAt ? new Date(data.alertAt) : undefined,
        notifierDetails: data.notifierDetails ?? undefined,
        patientName: data.patientName,
        patientAge: data.patientAge,
        patientGender: data.patientGender,
        patientNhif: data.patientNhif,
        patientNationalId: data.patientNationalId,
        patientContact: data.patientContact,
        nextOfKin: data.nextOfKin,
        nextOfKinPhone: data.nextOfKinPhone,
        massCasualty: data.massCasualty ?? false,
        massCasualtyCount: data.massCasualtyCount,
        watcherComments: data.watcherComments,
        preHospitalManagement: data.preHospitalManagement,
        alertNature: data.alertNature,
        alertNatureDetail: data.alertNatureDetail,
        originOfAlert: data.originOfAlert,
        placeOfReferral: data.placeOfReferral,
        ambulanceUsed: data.ambulanceUsed,
        targetFacilityId: data.targetFacilityId,
        surveillanceNote: data.surveillanceNote,
        healthcareWorkerName: data.healthcareWorkerName,
        healthcareWorkerContact: data.healthcareWorkerContact,
        isGbvCase: data.isGbvCase ?? false,
        vitals: data.vitals ?? undefined,
        maternityVitals: data.maternityVitals ?? undefined,
        assignedAgencyId: user.agencyId,
        watcherId: user.userId,
      },
    });

    const caseNumber = this.formatCaseNumber(created.caseSeq);
    const incident = await this.app.prisma.incident.update({
      where: { id: created.id },
      data: { caseNumber },
    });

    await this.writeAudit({
      userId: user.userId,
      action: 'CREATE',
      subjectId: incident.id,
      newValues: { status: initialStatus, caseNumber },
    });

    this.app.io.to(`role:${Role.DISPATCHER}`).emit('incident:new', incident);

    return incident;
  }

  /**
   * Turns a bare calendar date ("2026-08-03") into the correct UTC instant for
   * the start/end of that day **in Nairobi**. `new Date('2026-08-03')` parses as
   * UTC midnight, which is 3am Nairobi - so a naive range silently drops the
   * first three hours of "today" and includes three hours of the previous day.
   * Kenya has no DST, so the fixed +03:00 offset is safe.
   */
  private nairobiDayBoundary(value: string, edge: 'start' | 'end'): Date {
    const bare = /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!bare) return new Date(value); // full timestamp supplied - trust it
    return new Date(`${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}+03:00`);
  }

  async getIncidents(filters: { status?: IncidentStatus; watcherId?: string; caseNumber?: string; search?: string; from?: string; to?: string; page?: number; limit?: number }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const whereClause: any = {};
    if (filters.status) whereClause.status = filters.status;
    if (filters.watcherId) whereClause.watcherId = filters.watcherId;
    if (filters.caseNumber) whereClause.caseNumber = { contains: filters.caseNumber, mode: 'insensitive' };

    // Date range - inclusive of both endpoints, evaluated as Nairobi days.
    const range: any = {};
    if (filters.from) range.gte = this.nairobiDayBoundary(filters.from, 'start');
    if (filters.to) range.lte = this.nairobiDayBoundary(filters.to, 'end');
    if (range.gte || range.lte) whereClause.createdAt = range;

    // Free-text lookup across case number, patient identity and phone numbers -
    // supports "search by National ID or phone number".
    const search = filters.search?.trim();
    if (search) {
      whereClause.OR = [
        { caseNumber: { contains: search, mode: 'insensitive' } },
        { patientName: { contains: search, mode: 'insensitive' } },
        { patientNationalId: { contains: search, mode: 'insensitive' } },
        { patientNhif: { contains: search, mode: 'insensitive' } },
        { patientContact: { contains: search, mode: 'insensitive' } },
        { nextOfKinPhone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [incidents, total] = await Promise.all([
      this.app.prisma.incident.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          watcher: { select: { id: true, name: true } },
          dispatcher: { select: { id: true, name: true } },
        },
      }),
      this.app.prisma.incident.count({ where: whereClause }),
    ]);

    return {
      data: incidents,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Flat incident log for the EOC Excel/CSV report. Unpaginated and ordered
   * newest-first, joined to the target facility so the "Referral Place" column
   * can prefer the assigned facility name over the free-text place of referral.
   */
  async getIncidentsForExport(filters: { status?: IncidentStatus; from?: string; to?: string }) {
    const whereClause: any = {};
    if (filters.status) whereClause.status = filters.status;

    // Range is applied against the alert time when present, else creation time.
    // We filter on createdAt (always set) and treat alertAt as a display value.
    // Bare dates are resolved as Nairobi calendar days (see nairobiDayBoundary).
    const range: any = {};
    if (filters.from) range.gte = this.nairobiDayBoundary(filters.from, 'start');
    if (filters.to) range.lte = this.nairobiDayBoundary(filters.to, 'end');
    if (range.gte || range.lte) whereClause.createdAt = range;

    return this.app.prisma.incident.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        targetFacility: { select: { name: true } },
        // Lets the export's "Ambulance used" column fall back to the tracked
        // vehicle's registration when no free-text value was recorded.
        tasks: {
          select: { vehicle: { select: { registrationNumber: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async getIncidentById(id: string) {
    const incident = await this.app.prisma.incident.findUnique({
      where: { id },
      include: {
        watcher: { select: { id: true, name: true, phone: true } },
        dispatcher: { select: { id: true, name: true, phone: true } },
        tasks: {
          include: {
            vehicle: true,
            driver: { select: { name: true, phone: true } },
            emt:    { select: { name: true, phone: true } },
            nurse:  { select: { name: true, phone: true } },
          },
          orderBy: { receivedAt: 'desc' },
        },
        forwardingLogs: {
          include: {
            fromAgency: { select: { id: true, name: true } },
            toAgency: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        targetFacility: true,
      },
    });

    if (!incident) throw new NotFoundError('Incident not found');

    return incident;
  }

  async getIncidentAuditLog(id: string) {
    return this.app.prisma.auditLog.findMany({
      where: { subjectType: 'INCIDENT', subjectId: id },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateIncident(
    id: string,
    user: { userId: string; role: Role },
    data: {
      chiefComplaint?: string;
      locationName?: string;
      subCounty?: string;
      massCasualty?: boolean;
      massCasualtyCount?: number;
      watcherComments?: string;
      dispatcherComments?: string;
      dispatcherChallenges?: string;
      patientName?: string;
      patientAge?: string;
      patientGender?: string;
      patientNhif?: string;
      patientNationalId?: string;
      patientContact?: string;
      nextOfKin?: string;
      nextOfKinPhone?: string;
      alertNature?: string;
      alertNatureDetail?: string;
      placeOfReferral?: string;
      targetFacilityId?: string;
      hospitalLevelRequired?: number;
      healthcareWorkerName?: string;
      healthcareWorkerContact?: string;
      preHospitalManagement?: string;
      partnerNotes?: string;
      vitals?: Record<string, unknown>;
      maternityVitals?: Record<string, unknown>;
      pcrUrl?: string;
    }
  ) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('You do not have permission to update this incident');
    }

    const incident = await this.app.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundError('Incident not found');

    // Build a diff of only the fields that are actually changing
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    const updateData: Record<string, unknown> = {};

    const editableFields = [
      'chiefComplaint', 'locationName', 'subCounty', 'massCasualty',
      'massCasualtyCount', 'watcherComments', 'dispatcherComments',
      'dispatcherChallenges', 'patientName', 'patientAge', 'patientGender',
      'patientNhif', 'patientNationalId',
      'patientContact', 'nextOfKin', 'nextOfKinPhone', 'alertNature',
      'alertNatureDetail', 'placeOfReferral', 'targetFacilityId', 'hospitalLevelRequired',
      'healthcareWorkerName', 'healthcareWorkerContact',
      'preHospitalManagement', 'partnerNotes', 'pcrUrl', 'vitals', 'maternityVitals',
    ] as const;

    for (const field of editableFields) {
      let value = (data as Record<string, unknown>)[field];
      if (value === undefined) continue;
      // targetFacilityId is an optional FK - an empty string clears the referral
      if (field === 'targetFacilityId' && value === '') value = null;
      if ((incident as Record<string, unknown>)[field] !== value) {
        oldValues[field] = (incident as Record<string, unknown>)[field];
        newValues[field] = value;
      }
      updateData[field] = value;
    }

    const updated = await this.app.prisma.incident.update({
      where: { id },
      data: updateData,
    });

    if (Object.keys(newValues).length > 0) {
      await this.writeAudit({
        userId: user.userId,
        action: 'UPDATE',
        subjectId: id,
        oldValues,
        newValues,
      });
    }

    this.app.io.to(`incident:${id}`).emit('incident:update', updated);

    return updated;
  }

  async getIncidentTat(id: string) {
    const incident = await this.app.prisma.incident.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: { receivedAt: 'asc' },
          select: {
            receivedAt: true,
            acceptedAt: true,
            sceneArrivalAt: true,
            patientPickAt: true,
            facilityArrivalAt: true,
            completedAt: true,
            cancelledAt: true,
            status: true,
          },
        },
      },
    });

    if (!incident) throw new NotFoundError('Incident not found');

    const auditLog = await this.app.prisma.auditLog.findMany({
      where: { subjectType: 'INCIDENT', subjectId: id },
      orderBy: { createdAt: 'asc' },
    });

    const getStatusTs = (status: string): Date | null => {
      const entry = auditLog.find(
        a => a.action === 'STATUS_CHANGE' && (a.newValues as Record<string, unknown>)?.status === status
      );
      return entry ? entry.createdAt : null;
    };

    const task = incident.tasks[0] ?? null;

    type TatStep = {
      key: string;
      label: string;
      timestamp: Date | null;
      durationFromPreviousMs: number | null;
    };

    const rawSteps: { key: string; label: string; timestamp: Date | null }[] = [
      { key: 'alert_received',      label: 'Alert Received',        timestamp: incident.alertAt ?? null },
      { key: 'submitted',           label: 'Incident Submitted',     timestamp: incident.createdAt },
      { key: 'dispatch_handling',   label: 'Dispatcher Picked Up',   timestamp: getStatusTs('DISPATCH_HANDLING') },
      { key: 'dispatched',          label: 'Vehicle Dispatched',     timestamp: task?.receivedAt ?? null },
      { key: 'crew_accepted',       label: 'Crew Accepted',         timestamp: task?.acceptedAt ?? null },
      { key: 'at_scene',            label: 'Arrived at Scene',      timestamp: task?.sceneArrivalAt ?? null },
      { key: 'patient_picked',      label: 'Patient On Board',      timestamp: task?.patientPickAt ?? null },
      { key: 'at_hospital',         label: 'Arrived at Facility',   timestamp: task?.facilityArrivalAt ?? null },
      { key: 'task_completed',      label: 'Task Completed',        timestamp: task?.completedAt ?? task?.cancelledAt ?? null },
      { key: 'case_closed',         label: 'Case Closed',           timestamp: getStatusTs('RESOLVED') ?? (auditLog.find(a => a.action === 'CLOSE')?.createdAt ?? null) },
    ];

    // Drop the alert_received step if it's the same as submitted (no separate alertAt)
    const steps: TatStep[] = [];
    let prevTs: Date | null = null;
    for (const s of rawSteps) {
      if (s.key === 'alert_received' && !incident.alertAt) continue;
      const durationFromPreviousMs =
        s.timestamp && prevTs ? s.timestamp.getTime() - prevTs.getTime() : null;
      steps.push({ ...s, durationFromPreviousMs });
      if (s.timestamp) prevTs = s.timestamp;
    }

    const completed = steps.filter(s => s.timestamp !== null);
    const first = completed[0]?.timestamp ?? null;
    const last = completed[completed.length - 1]?.timestamp ?? null;
    const totalMs = first && last ? last.getTime() - first.getTime() : null;

    return { steps, totalMs };
  }

  async escalateIncident(
    id: string,
    user: { userId: string; role: Role },
    massCasualtyCount: number,
    notes?: string
  ) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('Only dispatchers and admins can escalate incidents');
    }

    const incident = await this.app.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundError('Incident not found');

    const updated = await this.app.prisma.incident.update({
      where: { id },
      data: {
        massCasualty: true,
        massCasualtyCount,
        ...(notes ? { dispatcherComments: notes } : {}),
      },
    });

    await this.writeAudit({
      userId: user.userId,
      action: 'ESCALATE',
      subjectId: id,
      oldValues: { massCasualty: incident.massCasualty, massCasualtyCount: incident.massCasualtyCount },
      newValues: { massCasualty: true, massCasualtyCount, ...(notes ? { notes } : {}) },
    });

    this.app.io
      .to(`role:${Role.DISPATCHER}`)
      .to(`role:${Role.ADMIN}`)
      .to(`role:${Role.SUPER_ADMIN}`)
      .emit('incident:escalated', {
        id,
        caseNumber: incident.caseNumber,
        locationName: incident.locationName,
        massCasualtyCount,
      });

    this.app.io.to(`incident:${id}`).emit('incident:update', updated);

    return updated;
  }

  async deescalateIncident(id: string, user: { userId: string; role: Role }) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('Only dispatchers and admins can de-escalate incidents');
    }

    const incident = await this.app.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundError('Incident not found');

    const updated = await this.app.prisma.incident.update({
      where: { id },
      data: { massCasualty: false, massCasualtyCount: null },
    });

    await this.writeAudit({
      userId: user.userId,
      action: 'DEESCALATE',
      subjectId: id,
      oldValues: { massCasualty: true, massCasualtyCount: incident.massCasualtyCount },
      newValues: { massCasualty: false },
    });

    this.app.io.to(`incident:${id}`).emit('incident:update', updated);

    return updated;
  }

  async getPartnerAgencies() {
    return this.app.prisma.agency.findMany({
      where: { type: 'PARTNER', isActive: true },
      select: { id: true, name: true, location: true },
      orderBy: { name: 'asc' },
    });
  }

  async assignToPartner(
    id: string,
    user: { userId: string; role: Role },
    partnerAgencyId: string,
    reason: string
  ) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('You do not have permission to assign this incident');
    }

    const incident = await this.app.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundError('Incident not found');

    const partnerAgency = await this.app.prisma.agency.findUnique({ where: { id: partnerAgencyId } });
    if (!partnerAgency || partnerAgency.type !== 'PARTNER') {
      throw new BadRequestError('Invalid partner agency');
    }

    const [updated] = await this.app.prisma.$transaction([
      this.app.prisma.incident.update({
        where: { id },
        data: { assignedAgencyId: partnerAgencyId },
      }),
      this.app.prisma.forwardingLog.create({
        data: {
          incidentId: id,
          fromAgencyId: incident.assignedAgencyId,
          toAgencyId: partnerAgencyId,
          reason,
        },
      }),
    ]);

    await this.writeAudit({
      userId: user.userId,
      action: 'ASSIGN_PARTNER',
      subjectId: id,
      oldValues: { assignedAgencyId: incident.assignedAgencyId },
      newValues: { assignedAgencyId: partnerAgencyId, partnerName: partnerAgency.name, reason },
    });

    this.app.io.to(`incident:${id}`).emit('incident:update', updated);
    this.app.io.to(`role:${Role.PARTNER}`).emit('incident:new', updated);

    return updated;
  }

  async updateIncidentStatus(
    id: string,
    user: { userId: string; role: Role },
    status: IncidentStatus,
    comments?: string
  ) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('You do not have permission to change incident status');
    }

    const incident = await this.app.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundError('Incident not found');

    let dispatcherId = incident.dispatcherId;
    if (!dispatcherId && status === IncidentStatus.DISPATCH_HANDLING && user.role === Role.DISPATCHER) {
      dispatcherId = user.userId;
    }

    const updated = await this.app.prisma.incident.update({
      where: { id },
      data: {
        status,
        dispatcherId,
        dispatcherComments: comments ? comments : undefined,
      },
    });

    await this.writeAudit({
      userId: user.userId,
      action: 'STATUS_CHANGE',
      subjectId: id,
      oldValues: { status: incident.status },
      newValues: { status, ...(comments ? { comments } : {}) },
    });

    this.app.io.to(`incident:${id}`).emit('incident:update', updated);

    return updated;
  }

  async closeIncident(id: string, user: { userId: string; role: Role }, reason: string) {
    const incident = await this.app.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundError('Incident not found');
    if (incident.status === IncidentStatus.RESOLVED) {
      throw new BadRequestError('This incident is already closed');
    }

    const activeTasks = await this.app.prisma.task.findMany({
      where: {
        incidentId: id,
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
      },
    });

    const now = new Date();

    const updated = await this.app.prisma.$transaction(async (tx) => {
      const inc = await tx.incident.update({
        where: { id },
        data: {
          status: IncidentStatus.RESOLVED,
          closureReason: reason,
          closedById: user.userId,
        },
      });

      for (const task of activeTasks) {
        await tx.task.update({
          where: { id: task.id },
          data: { status: TaskStatus.COMPLETED, completedAt: now },
        });
        await tx.vehicle.update({
          where: { id: task.vehicleId },
          data: { status: VehicleStatus.READY },
        });
      }

      return inc;
    });

    await this.writeAudit({
      userId: user.userId,
      action: 'CLOSE',
      subjectId: id,
      oldValues: { status: incident.status },
      newValues: { status: IncidentStatus.RESOLVED, closureReason: reason },
    });

    this.app.io.to(`incident:${id}`).emit('incident:update', updated);
    this.app.io
      .to(`role:${Role.DISPATCHER}`)
      .to(`role:${Role.ADMIN}`)
      .to(`role:${Role.SUPER_ADMIN}`)
      .emit('incident:closed', { id, caseNumber: incident.caseNumber, reason, closedBy: user.role });

    for (const task of activeTasks) {
      const updatedTask = await this.app.prisma.task.findUnique({ where: { id: task.id } });
      if (!updatedTask) continue;

      let updateRoom = this.app.io
        .to(`user:${task.driverId}`)
        .to(`role:${Role.DISPATCHER}`);
      if (task.emtId) updateRoom = updateRoom.to(`user:${task.emtId}`);
      if (task.nurseId) updateRoom = updateRoom.to(`user:${task.nurseId}`);
      updateRoom.emit('task:updated', updatedTask);
    }

    return updated;
  }

  // ── Nature options (user-extensible taxonomy) ─────────────────────────────

  // The nature → specific-nature taxonomy lives in ./nature-taxonomy.ts so the reseed
  // script and the auto-seed below share one source of truth.
  private readonly SEED_NATURES = NATURE_TAXONOMY;

  /** Flatten the taxonomy into ordered rows, assigning an incrementing sortOrder. */
  private buildSeedRows(): Array<{ nature: string; detail: string | null; sortOrder: number }> {
    const rows: Array<{ nature: string; detail: string | null; sortOrder: number }> = [];
    let order = 0;
    for (const { nature, details } of this.SEED_NATURES) {
      rows.push({ nature, detail: null, sortOrder: order++ });
      for (const detail of details) rows.push({ nature, detail, sortOrder: order++ });
    }
    return rows;
  }

  async getNatureOptions(): Promise<Array<{ nature: string; details: string[] }>> {
    const rows = await this.app.prisma.incidentNatureOption.findMany({
      orderBy: [{ sortOrder: 'asc' }, { nature: 'asc' }, { detail: 'asc' }],
    });

    // Auto-seed defaults on first use
    if (rows.length === 0) {
      await this.app.prisma.incidentNatureOption.createMany({
        data: this.buildSeedRows(),
        skipDuplicates: true,
      });
      return this.SEED_NATURES.map(({ nature, details }) => ({ nature, details }));
    }

    // Group into { nature, details[] } preserving the sortOrder-driven row order.
    const map = new Map<string, string[]>();
    for (const row of rows) {
      if (!map.has(row.nature)) map.set(row.nature, []);
      if (row.detail) map.get(row.nature)!.push(row.detail);
    }
    return Array.from(map.entries()).map(([nature, details]) => ({ nature, details }));
  }

  /** Next sortOrder for a freshly added option - appends after everything existing. */
  private async nextNatureSortOrder(): Promise<number> {
    const max = await this.app.prisma.incidentNatureOption.aggregate({ _max: { sortOrder: true } });
    return (max._max.sortOrder ?? -1) + 1;
  }

  async createNatureOption(nature: string, detail?: string): Promise<void> {
    // upsert can't match NULL in a unique index (NULL != NULL in Postgres),
    // so use findFirst + create for the top-level nature row
    const topExists = await this.app.prisma.incidentNatureOption.findFirst({
      where: { nature, detail: null },
    });
    if (!topExists) {
      await this.app.prisma.incidentNatureOption.create({
        data: { nature, detail: null, sortOrder: await this.nextNatureSortOrder() },
      });
    }
    if (detail) {
      const detailExists = await this.app.prisma.incidentNatureOption.findFirst({
        where: { nature, detail },
      });
      if (!detailExists) {
        await this.app.prisma.incidentNatureOption.create({
          data: { nature, detail, sortOrder: await this.nextNatureSortOrder() },
        });
      }
    }
  }
}