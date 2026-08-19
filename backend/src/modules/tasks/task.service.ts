import { FastifyInstance } from 'fastify';
import { TaskStatus, IncidentStatus, Role, VehicleStatus } from '../../shared/types/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError.js';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { sendAdvantaSms } from '../../services/sms.js';

type AssignmentIncident = {
  caseNumber: string;
  locationName: string;
  subCounty: string;
  chiefComplaint: string;
  alertNature: string | null;
  alertNatureDetail: string | null;
  lat: number | null;
  lng: number | null;
};

export class TaskService {
  constructor(private app: FastifyInstance) {}

  /** Build the crew SMS text for a new dispatch/reassignment. */
  private buildAssignmentSms(incident: AssignmentIncident, registrationNumber: string): string {
    const nature = [incident.alertNature, incident.alertNatureDetail].filter(Boolean).join(' – ') || incident.chiefComplaint;
    const location = [incident.locationName, incident.subCounty].filter(Boolean).join(', ');
    const maps = incident.lat != null && incident.lng != null ? ` Map: https://maps.google.com/?q=${incident.lat},${incident.lng}` : '';
    return `EOC DISPATCH ${incident.caseNumber} | Vehicle ${registrationNumber} | ${nature} | Location: ${location} | ${incident.chiefComplaint}.${maps}`;
  }

  /**
   * Fire-and-forget SMS to the driver/EMT/nurse just assigned to a task.
   * Never throws into the dispatch flow - a failed text shouldn't block dispatch.
   */
  private notifyCrewOfAssignment(
    crew: (({ phone: string | null }) | null | undefined)[],
    incident: AssignmentIncident,
    registrationNumber: string,
  ): void {
    const message = this.buildAssignmentSms(incident, registrationNumber);
    for (const member of crew) {
      if (!member?.phone) continue;
      sendAdvantaSms(member.phone, message).catch((err) => {
        this.app.log.warn({ err, phone: member.phone }, 'crew assignment SMS failed');
      });
    }
  }

  private uploadsDir() {
    // Use repo-local uploads dir (works in dev). In production, prefer object storage.
    return path.resolve(process.cwd(), 'uploads', 'pcr');
  }

  private async ensureUploadsDir() {
    await fs.mkdir(this.uploadsDir(), { recursive: true });
  }

  async uploadPatientCareReport(
    taskId: string,
    user: { userId: string; role: Role },
    file: { filename: string; mimetype: string; file: NodeJS.ReadableStream },
    note?: string
  ) {
    const task = await this.app.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundError('Task not found');

    const isCrew = [task.driverId, task.emtId, task.nurseId].includes(user.userId);
    const isDispatch = (<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role);
    if (!isCrew && !isDispatch) throw new ForbiddenError('You are not assigned to this task');

    // Crew may only upload once the task is completed; dispatch/admin can (re)upload at any time.
    if (!isDispatch && task.status !== TaskStatus.COMPLETED) {
      throw new BadRequestError('Patient care report can only be uploaded after task is completed');
    }

    await this.ensureUploadsDir();

    const ext = path.extname(file.filename) || '';
    const safeExt = ext.length <= 10 ? ext : '';
    const storedName = `${taskId}-${Date.now()}${safeExt}`;
    const storedPath = path.join(this.uploadsDir(), storedName);

    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(storedPath);
      file.file.pipe(out);
      out.on('finish', () => resolve());
      out.on('error', reject);
      file.file.on('error', reject);
    });

    const stat = await fs.stat(storedPath);

    const report = await this.app.prisma.patientCareReport.create({
      data: {
        taskId,
        uploaderId: user.userId,
        note: note ?? '',
        filePath: storedName,
        mimeType: file.mimetype,
        fileSize: stat.size,
      },
    });

    return report;
  }

  async listPatientCareReports(taskId: string, user: { userId: string; role: Role }) {
    const task = await this.app.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundError('Task not found');

    const isCrew = [task.driverId, task.emtId, task.nurseId].includes(user.userId);
    const isDispatch = (<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role);
    if (!isCrew && !isDispatch) throw new ForbiddenError('You do not have permission to view reports for this task');

    return this.app.prisma.patientCareReport.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        taskId: true,
        uploaderId: true,
        note: true,
        filePath: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
      },
    });
  }

  /**
   * Creates a new task by dispatching a vehicle to an incident.
   * Crew (driver/EMT/nurse) is pulled from whoever is checked in to the vehicle.
   */
  async createTask(
    user: { userId: string; role: Role },
    data: {
      incidentId: string;
      vehicleId: string;
      dispatcherComments?: string;
    }
  ) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('Only dispatchers and admins can create tasks');
    }

    const [incident, vehicle] = await Promise.all([
      this.app.prisma.incident.findUnique({ where: { id: data.incidentId } }),
      this.app.prisma.vehicle.findUnique({
        where: { id: data.vehicleId },
        include: {
          currentDriver: { select: { id: true, name: true, phone: true } },
          currentEmt:    { select: { id: true, name: true, phone: true } },
          currentNurse:  { select: { id: true, name: true, phone: true } },
        },
      }),
    ]);

    if (!incident) throw new NotFoundError('Incident not found');
    if (!vehicle) throw new NotFoundError('Vehicle not found');
    if (!vehicle.currentDriverId) throw new BadRequestError('No driver is checked in to this vehicle');

    const [task] = await this.app.prisma.$transaction([
      this.app.prisma.task.create({
        data: {
          status: TaskStatus.PENDING,
          incidentId: data.incidentId,
          vehicleId: data.vehicleId,
          driverId: vehicle.currentDriverId,
          emtId: vehicle.currentEmtId ?? undefined,
          nurseId: vehicle.currentNurseId ?? undefined,
        },
      }),
      this.app.prisma.incident.update({
        where: { id: data.incidentId },
        data: {
          status: IncidentStatus.DISPATCHED,
          ...(data.dispatcherComments ? { dispatcherComments: data.dispatcherComments } : {}),
        },
      }),
      this.app.prisma.vehicle.update({
        where: { id: data.vehicleId },
        data: { status: VehicleStatus.BUSY },
      }),
    ]);

    // Notify crew via socket
    let room = this.app.io.to(`user:${vehicle.currentDriverId}`);
    if (vehicle.currentEmtId) room = room.to(`user:${vehicle.currentEmtId}`);
    if (vehicle.currentNurseId) room = room.to(`user:${vehicle.currentNurseId}`);
    room.emit('task:assigned', task);

    // Notify crew via SMS (fire-and-forget - never blocks dispatch)
    this.notifyCrewOfAssignment(
      [vehicle.currentDriver, vehicle.currentEmt, vehicle.currentNurse],
      incident,
      vehicle.registrationNumber,
    );

    return task;
  }

  /**
   * Handover / case termination with reassignment. Cancels the current task with a
   * required reason, checks out the original driver (clears vehicle crew), and -
   * when a replacement vehicle is given or autoAssign finds one - dispatches a
   * new task to that crew. Drivers may handover their own active task; dispatchers
   * may handover any task.
   */
  async reassignTask(
    taskId: string,
    user: { userId: string; role: Role; agencyId?: string },
    data: { reason: string; newVehicleId?: string; autoAssign?: boolean },
  ) {
    const isDispatch = (<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role);
    const reason = data.reason?.trim();
    if (!reason || reason.length < 5) {
      throw new BadRequestError('A valid reason (at least 5 characters) is required to reassign');
    }

    const task = await this.app.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        vehicle: { select: { id: true, agencyId: true } },
        incident: {
          select: {
            id: true, lat: true, lng: true, caseNumber: true, locationName: true,
            subCounty: true, chiefComplaint: true, alertNature: true, alertNatureDetail: true,
          },
        },
      },
    });
    if (!task) throw new NotFoundError('Task not found');
    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELLED) {
      throw new BadRequestError('This task is already closed');
    }

    const isTaskDriver = user.role === Role.DRIVER && task.driverId === user.userId;
    if (!isDispatch && !isTaskDriver) {
      throw new ForbiddenError('Only the assigned driver or a dispatcher can handover this task');
    }

    // Resolve replacement vehicle: explicit id, or auto-pick if requested.
    let newVehicle = null as null | Awaited<ReturnType<typeof this.app.prisma.vehicle.findUnique>>;

    if (data.newVehicleId) {
      if (data.newVehicleId === task.vehicleId) {
        throw new BadRequestError('Choose a different vehicle to reassign to');
      }
      newVehicle = await this.app.prisma.vehicle.findUnique({ where: { id: data.newVehicleId } });
      if (!newVehicle) throw new NotFoundError('Replacement vehicle not found');
      if (!newVehicle.isActive) throw new BadRequestError('Replacement vehicle is not active');
      if (newVehicle.status !== VehicleStatus.READY) {
        throw new BadRequestError('Replacement vehicle is not available');
      }
      if (!newVehicle.currentDriverId) {
        throw new BadRequestError('No driver is checked in to the replacement vehicle');
      }
      if (newVehicle.agencyId !== task.vehicle.agencyId) {
        throw new BadRequestError('Replacement vehicle must belong to the same agency');
      }
    } else if (data.autoAssign) {
      newVehicle = await this.findAvailableVehicleForHandover(
        task.vehicle.agencyId,
        task.vehicleId,
        task.incident.lat,
        task.incident.lng,
      );
      // If none available, fall through - original driver is still checked out and
      // the incident returns to DISPATCH_HANDLING below.
    }

    const now = new Date();

    // Close the original task.
    const cancelled = await this.app.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.CANCELLED, cancelledAt: now, cancelReason: reason },
    });

    // Check out the original driver and clear all crew slots on their vehicle.
    await this.app.prisma.vehicle.update({
      where: { id: task.vehicleId },
      data: {
        status: VehicleStatus.READY,
        currentDriverId: null,
        currentEmtId: null,
        currentNurseId: null,
      },
    });

    // Tell the original crew their task is cancelled so their app clears it.
    let oldRoom = this.app.io.to(`user:${task.driverId}`).to(`role:${Role.DISPATCHER}`);
    if (task.emtId) oldRoom = oldRoom.to(`user:${task.emtId}`);
    if (task.nurseId) oldRoom = oldRoom.to(`user:${task.nurseId}`);
    oldRoom.emit('task:updated', cancelled);
    this.app.io
      .to(`role:${Role.DISPATCHER}`)
      .to(`role:${Role.ADMIN}`)
      .to(`role:${Role.SUPER_ADMIN}`)
      .emit('vehicle:crew', { id: task.vehicleId, currentDriverId: null, currentEmtId: null, currentNurseId: null });

    // If no replacement was given/found, send the incident back to dispatch handling.
    if (!newVehicle) {
      await this.app.prisma.incident.update({
        where: { id: task.incidentId },
        data: { status: IncidentStatus.DISPATCH_HANDLING },
      });
      return { cancelled, newTask: null, checkedOutVehicleId: task.vehicleId };
    }

    // Dispatch a fresh task to the replacement vehicle's crew.
    const newTask = await this.app.prisma.task.create({
      data: {
        status: TaskStatus.PENDING,
        incidentId: task.incidentId,
        vehicleId: newVehicle.id,
        driverId: newVehicle.currentDriverId!,
        emtId: newVehicle.currentEmtId ?? undefined,
        nurseId: newVehicle.currentNurseId ?? undefined,
      },
      include: {
        incident: true,
        vehicle: { select: { id: true, registrationNumber: true, imei: true } },
        driver: { select: { id: true, name: true, phone: true } },
        emt: { select: { id: true, name: true, phone: true } },
        nurse: { select: { id: true, name: true, phone: true } },
      },
    });
    await this.app.prisma.vehicle.update({
      where: { id: newVehicle.id },
      data: { status: VehicleStatus.BUSY },
    });
    await this.app.prisma.incident.update({
      where: { id: task.incidentId },
      data: { status: IncidentStatus.DISPATCHED },
    });

    let newRoom = this.app.io.to(`user:${newVehicle.currentDriverId}`).to(`role:${Role.DISPATCHER}`);
    if (newVehicle.currentEmtId) newRoom = newRoom.to(`user:${newVehicle.currentEmtId}`);
    if (newVehicle.currentNurseId) newRoom = newRoom.to(`user:${newVehicle.currentNurseId}`);
    newRoom.emit('task:assigned', newTask);

    // Notify the replacement crew via SMS (fire-and-forget)
    this.notifyCrewOfAssignment(
      [newTask.driver, newTask.emt, newTask.nurse],
      newTask.incident,
      newVehicle.registrationNumber,
    );

    return { cancelled, newTask, checkedOutVehicleId: task.vehicleId };
  }

  /** Pick the nearest READY vehicle with a checked-in driver in the agency. */
  private async findAvailableVehicleForHandover(
    agencyId: string,
    excludeVehicleId: string,
    lat?: number | null,
    lng?: number | null,
  ) {
    const candidates = await this.app.prisma.vehicle.findMany({
      where: {
        agencyId,
        isActive: true,
        status: VehicleStatus.READY,
        currentDriverId: { not: null },
        id: { not: excludeVehicleId },
      },
    });
    if (candidates.length === 0) return null;
    if (lat == null || lng == null) return candidates[0];

    const toRad = (d: number) => (d * Math.PI) / 180;
    const dist = (aLat: number, aLng: number) => {
      const R = 6371;
      const dLat = toRad(aLat - lat);
      const dLng = toRad(aLng - lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat)) * Math.cos(toRad(aLat)) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.asin(Math.sqrt(a));
    };

    return [...candidates].sort((a, b) => {
      const da = a.lastLat != null && a.lastLng != null ? dist(a.lastLat, a.lastLng) : Number.POSITIVE_INFINITY;
      const db = b.lastLat != null && b.lastLng != null ? dist(b.lastLat, b.lastLng) : Number.POSITIVE_INFINITY;
      return da - db;
    })[0];
  }

  /**
   * Updates a task's status and records the lifecycle timestamp.
   */
  async updateTaskStatus(
    taskId: string,
    user: { userId: string; role: Role },
    newStatus: TaskStatus,
    reason?: string
  ) {
    const task = await this.app.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundError('Task not found');

    // Basic authorization: user must be part of the task or be dispatcher/admin
    const isCrew = [task.driverId, task.emtId, task.nurseId].includes(user.userId);
    const isDispatch = (<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role);

    if (!isCrew && !isDispatch) {
      throw new ForbiddenError('You do not have permission to update this task');
    }

    const updateData: any = { status: newStatus };
    const now = new Date();

    // Map status to timestamp field
    switch (newStatus) {
      case TaskStatus.ACCEPTED:
        updateData.acceptedAt = now;
        break;
      case TaskStatus.EN_ROUTE:
        // Assume they accepted it if they jump straight to en_route
        if (!task.acceptedAt) updateData.acceptedAt = now;
        break;
      case TaskStatus.AT_SCENE:
        updateData.sceneArrivalAt = now;
        break;
      case TaskStatus.PATIENT_PICKED:
        updateData.patientPickAt = now;
        break;
      case TaskStatus.AT_HOSPITAL:
        updateData.facilityArrivalAt = now;
        break;
      case TaskStatus.COMPLETED:
        updateData.completedAt = now;
        break;

      case TaskStatus.CANCELLED:
        if (!isDispatch) throw new ForbiddenError('Only dispatchers can cancel tasks');
        updateData.cancelledAt = now;
        updateData.cancelReason = reason;
        break;
    }

    const updatedTask = await this.app.prisma.task.update({
      where: { id: taskId },
      data: updateData,
    });

    // Release the vehicle when the task ends
    if (newStatus === TaskStatus.COMPLETED || newStatus === TaskStatus.CANCELLED) {
      await this.app.prisma.vehicle.update({
        where: { id: task.vehicleId },
        data: { status: VehicleStatus.READY },
      });
    }

    if (newStatus === TaskStatus.COMPLETED) {
      await this.app.prisma.incident.update({
        where: { id: task.incidentId },
        data: { status: IncidentStatus.RESOLVED },
      });
    }

    // Broadcast update to the crew and dispatchers
    let updateRoom = this.app.io
      .to(`user:${task.driverId}`)
      .to(`role:${Role.DISPATCHER}`);
    if (task.emtId) updateRoom = updateRoom.to(`user:${task.emtId}`);
    if (task.nurseId) updateRoom = updateRoom.to(`user:${task.nurseId}`);
    updateRoom.emit('task:updated', updatedTask);

    return updatedTask;
  }

  /**
   * Returns the active (non-completed, non-cancelled) task for the current responder.
   */
  async getActiveTask(userId: string) {
    const task = await this.app.prisma.task.findFirst({
      where: {
        OR: [{ driverId: userId }, { emtId: userId }, { nurseId: userId }],
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
      },
      include: {
        incident: true,
        vehicle: { select: { id: true, registrationNumber: true, imei: true } },
        driver: { select: { id: true, name: true, phone: true } },
        emt: { select: { id: true, name: true, phone: true } },
        nurse: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { receivedAt: 'desc' },
    });

    return task;
  }

  /**
   * Returns paginated completed/cancelled tasks for the current responder.
   */
  async getTaskHistory(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.app.prisma.task.findMany({
        where: {
          OR: [{ driverId: userId }, { emtId: userId }, { nurseId: userId }],
          status: { in: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
        },
        orderBy: { receivedAt: 'desc' },
        skip,
        take: limit,
        include: {
          incident: { select: { id: true, caseNumber: true, chiefComplaint: true, locationName: true, subCounty: true } },
          vehicle: { select: { id: true, registrationNumber: true } },
          _count: { select: { patientCareReports: true } },
          patientCareReports: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.app.prisma.task.count({
        where: {
          OR: [{ driverId: userId }, { emtId: userId }, { nurseId: userId }],
          status: { in: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
        },
      }),
    ]);
    const enriched = data.map((t: any) => ({
      ...t,
      pcrCount: t._count?.patientCareReports ?? 0,
      lastPcrAt: t.patientCareReports?.[0]?.createdAt ?? null,
    }));
    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Logs patient vitals and pre-hospital management notes for a task.
   */
  async updatePatientData(
    taskId: string,
    userId: string,
    data: {
      preHospitalManagement: string;
      dispatcherChallenges?: string;
      handoverVitals?: Record<string, unknown>;
    }
  ) {
    const task = await this.app.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundError('Task');

    const isCrew = [task.driverId, task.emtId, task.nurseId].includes(userId);
    if (!isCrew) throw new ForbiddenError('You are not assigned to this task');

    // Vital signs captured at hospital handover live on the task.
    if (data.handoverVitals !== undefined) {
      await this.app.prisma.task.update({
        where: { id: taskId },
        data: { handoverVitals: data.handoverVitals as any },
      });
    }

    // Store clinical notes on the incident
    const updatedIncident = await this.app.prisma.incident.update({
      where: { id: task.incidentId },
      data: {
        preHospitalManagement: data.preHospitalManagement,
        dispatcherChallenges: data.dispatcherChallenges,
      },
    });

    this.app.io.to(`incident:${task.incidentId}`).emit('incident:update', updatedIncident);

    return updatedIncident;
  }

  /**
   * Add a destination stop to an in-progress task (e.g. re-route KNH -> Mama Lucy).
   * Emits a realtime event so the dispatcher console and the crew's mobile app can
   * react and surface a push notification.
   */
  async addStop(
    taskId: string,
    user: { userId: string; role: Role },
    data: { name: string; facilityId?: string; lat?: number; lng?: number; note?: string }
  ) {
    const task = await this.app.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundError('Task');

    const isCrew = [task.driverId, task.emtId, task.nurseId].includes(user.userId);
    const isDispatch = (<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role);
    if (!isCrew && !isDispatch) throw new ForbiddenError('You are not assigned to this task');

    const count = await this.app.prisma.taskStop.count({ where: { taskId } });
    const stop = await this.app.prisma.taskStop.create({
      data: {
        taskId,
        name: data.name,
        facilityId: data.facilityId,
        lat: data.lat,
        lng: data.lng,
        note: data.note,
        sequence: count,
        addedById: user.userId,
      },
    });

    this.emitStopEvent('task:stop-added', task, { taskId, stop });
    return stop;
  }

  /**
   * Emit a stop event to the rooms clients actually join: the dispatcher role room
   * and each assigned crew member's personal room (the mobile app auto-joins
   * `user:{id}` from its token). The `incident:` room is kept for parity with the
   * rest of the codebase but is not what delivers to live clients.
   */
  private emitStopEvent(
    event: 'task:stop-added' | 'task:stop-updated',
    task: { incidentId: string; driverId: string; emtId: string | null; nurseId: string | null },
    payload: unknown,
  ) {
    this.app.io.to(`role:${Role.DISPATCHER}`).emit(event, payload);
    for (const uid of [task.driverId, task.emtId, task.nurseId]) {
      if (uid) this.app.io.to(`user:${uid}`).emit(event, payload);
    }
    this.app.io.to(`incident:${task.incidentId}`).emit(event, payload);
  }

  listStops(taskId: string) {
    return this.app.prisma.taskStop.findMany({
      where: { taskId },
      orderBy: { sequence: 'asc' },
    });
  }

  async markStopArrived(taskId: string, stopId: string, user: { userId: string; role: Role }) {
    const task = await this.app.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundError('Task');
    const isCrew = [task.driverId, task.emtId, task.nurseId].includes(user.userId);
    const isDispatch = (<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role);
    if (!isCrew && !isDispatch) throw new ForbiddenError('You are not assigned to this task');

    const stop = await this.app.prisma.taskStop.update({
      where: { id: stopId },
      data: { arrivedAt: new Date() },
    });
    this.emitStopEvent('task:stop-updated', task, { taskId, stop });
    return stop;
  }
}
