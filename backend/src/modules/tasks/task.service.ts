import { FastifyInstance } from 'fastify';
import { TaskStatus, IncidentStatus, Role, VehicleStatus } from '../../shared/types/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError.js';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { sendAdvantaSms } from '../../services/sms.js';
import { getChecklistSummary, checklistIncompleteMessage } from '../fleet/checklist.js';
import {
  clearedCrew,
  crewInclude,
  crewIncompleteMessage,
  isCrewComplete,
  taskCrewFromVehicle,
  taskCrewIds,
  taskCrewInclude,
  vehicleCrewIds,
} from '../fleet/crew.js';
import { PushSenderService } from '../notifications/push-sender.service.js';
import { haversineDistance } from '../../shared/utils/haversine.js';

/** Mirrors TaskStatus.labels in frontend/src/utils/taskStatus.ts and nccg/lib/models/task.dart. */
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  EN_ROUTE: 'En Route',
  AT_SCENE: 'At Scene',
  PATIENT_PICKED: 'Patient Picked Up',
  AT_HOSPITAL: 'At Hospital',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

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
  private pushSender: PushSenderService;

  constructor(private app: FastifyInstance) {
    this.pushSender = new PushSenderService(app);
  }

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

  /**
   * Fire-and-forget mobile push to the driver/EMT/nurse just assigned to a
   * task - a no-op if push isn't configured/active or a crew member's app
   * never registered an fcmToken. Never throws into the dispatch flow.
   */
  private notifyCrewOfPushAssignment(
    crewIds: (string | null | undefined)[],
    incident: AssignmentIncident,
    registrationNumber: string,
  ): void {
    const nature = [incident.alertNature, incident.alertNatureDetail].filter(Boolean).join(' – ') || incident.chiefComplaint;
    this.pushSender
      .sendToUsers(
        crewIds,
        `New case: ${incident.caseNumber}`,
        `${registrationNumber} · ${nature} · ${incident.locationName}`,
        { type: 'TASK_ASSIGNED', caseNumber: incident.caseNumber }
      )
      .catch((err) => this.app.log.warn({ err }, 'crew assignment push failed'));
  }

  /**
   * Fire-and-forget mobile push telling the crew a task's stage changed -
   * e.g. dispatch cancelling a case the crew is en route to. Excludes
   * whoever just made the change themselves (they don't need telling), so
   * only the other one or two crew members on the task get it.
   */
  private notifyCrewOfStatusPush(
    crewIds: (string | null | undefined)[],
    actorUserId: string,
    caseNumber: string,
    newStatus: TaskStatus,
  ): void {
    const recipients = crewIds.filter((id) => id !== actorUserId);
    const label = STATUS_LABELS[newStatus] ?? newStatus;
    this.pushSender
      .sendToUsers(
        recipients,
        `${caseNumber}: ${label}`,
        newStatus === TaskStatus.CANCELLED ? 'This case was cancelled.' : `Status updated to ${label}.`,
        { type: 'TASK_STATUS_CHANGED', caseNumber, status: newStatus }
      )
      .catch((err) => this.app.log.warn({ err }, 'crew status push failed'));
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

    const isCrew = taskCrewIds(task).includes(user.userId);
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

    const isCrew = taskCrewIds(task).includes(user.userId);
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
        include: crewInclude,
      }),
    ]);

    if (!incident) throw new NotFoundError('Incident not found');
    if (!vehicle) throw new NotFoundError('Vehicle not found');
    const driverId = vehicle.currentDriverId;
    if (!driverId) throw new BadRequestError('No driver is checked in to this vehicle');
    const crewProblem = crewIncompleteMessage(vehicle);
    if (crewProblem) throw new BadRequestError(crewProblem);

    const checklist = await getChecklistSummary(this.app.prisma, data.vehicleId);
    if (!checklist.complete) {
      throw new BadRequestError(checklistIncompleteMessage(checklist));
    }

    const [task] = await this.app.prisma.$transaction([
      this.app.prisma.task.create({
        data: {
          status: TaskStatus.PENDING,
          incidentId: data.incidentId,
          vehicleId: data.vehicleId,
          ...taskCrewFromVehicle({ ...vehicle, currentDriverId: driverId }),
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
    this.app.io.to(vehicleCrewIds(vehicle).map((id) => `user:${id}`)).emit('task:assigned', task);

    // Notify crew via SMS + push (fire-and-forget - never blocks dispatch)
    this.notifyCrewOfAssignment(
      [vehicle.currentDriver, vehicle.currentEmt, vehicle.currentEmt2, vehicle.currentNurse, vehicle.currentNurse2],
      incident,
      vehicle.registrationNumber,
    );
    this.notifyCrewOfPushAssignment(vehicleCrewIds(vehicle), incident, vehicle.registrationNumber);

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
      const replacementCrewProblem = crewIncompleteMessage(newVehicle);
      if (replacementCrewProblem) {
        throw new BadRequestError(`Replacement vehicle: ${replacementCrewProblem.toLowerCase()}`);
      }
      const replacementChecklist = await getChecklistSummary(this.app.prisma, newVehicle.id);
      if (!replacementChecklist.complete) {
        throw new BadRequestError(`Replacement ${checklistIncompleteMessage(replacementChecklist).toLowerCase()}`);
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
        ...clearedCrew,
      },
    });

    // Tell the original crew their task is cancelled so their app clears it.
    this.app.io
      .to([...taskCrewIds(task).map((id) => `user:${id}`), `role:${Role.DISPATCHER}`])
      .emit('task:updated', cancelled);
    this.notifyCrewOfStatusPush(
      taskCrewIds(task),
      user.userId,
      task.incident.caseNumber,
      TaskStatus.CANCELLED,
    );
    this.app.io
      .to(`role:${Role.DISPATCHER}`)
      .to(`role:${Role.ADMIN}`)
      .to(`role:${Role.SUPER_ADMIN}`)
      .emit('vehicle:crew', { id: task.vehicleId, ...clearedCrew });

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
        ...taskCrewFromVehicle({ ...newVehicle, currentDriverId: newVehicle.currentDriverId! }),
      },
      include: {
        incident: true,
        vehicle: { select: { id: true, registrationNumber: true, imei: true } },
        ...taskCrewInclude,
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

    this.app.io
      .to([...vehicleCrewIds(newVehicle).map((id) => `user:${id}`), `role:${Role.DISPATCHER}`])
      .emit('task:assigned', newTask);

    // Notify the replacement crew via SMS + push (fire-and-forget)
    this.notifyCrewOfAssignment(
      [newTask.driver, newTask.emt, newTask.emt2, newTask.nurse, newTask.nurse2],
      newTask.incident,
      newVehicle.registrationNumber,
    );
    this.notifyCrewOfPushAssignment(vehicleCrewIds(newVehicle), newTask.incident, newVehicle.registrationNumber);

    return { cancelled, newTask, checkedOutVehicleId: task.vehicleId };
  }

  /** Pick the nearest READY vehicle with a complete crew in the agency. */
  private async findAvailableVehicleForHandover(
    agencyId: string,
    excludeVehicleId: string,
    lat?: number | null,
    lng?: number | null,
  ) {
    const candidates = (
      await this.app.prisma.vehicle.findMany({
        where: {
          agencyId,
          isActive: true,
          status: VehicleStatus.READY,
          currentDriverId: { not: null },
          id: { not: excludeVehicleId },
        },
      })
    ).filter(isCrewComplete);
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
    const task = await this.app.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        incident: {
          select: {
            caseNumber: true,
            lat: true,
            lng: true,
            targetFacility: { select: { lat: true, lng: true } },
          },
        },
        vehicle: { select: { trackerLat: true, trackerLng: true, lastLat: true, lastLng: true } },
      },
    });
    if (!task) throw new NotFoundError('Task not found');

    // Basic authorization: user must be part of the task or be dispatcher/admin
    const isCrew = taskCrewIds(task).includes(user.userId);
    const isDispatch = (<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role);

    if (!isCrew && !isDispatch) {
      throw new ForbiddenError('You do not have permission to update this task');
    }

    const updateData: any = { status: newStatus };
    const now = new Date();

    // Live ambulance fix (tracker first). Phone check-in coordinates are never used.
    const vehicleLat = task.vehicle.trackerLat ?? task.vehicle.lastLat;
    const vehicleLng = task.vehicle.trackerLng ?? task.vehicle.lastLng;
    const sceneLat = task.incident.lat;
    const sceneLng = task.incident.lng;

    // Map status to timestamp field
    switch (newStatus) {
      case TaskStatus.ACCEPTED:
        updateData.acceptedAt = now;
        Object.assign(updateData, this.sceneLeg(task, vehicleLat, vehicleLng, sceneLat, sceneLng));
        break;
      case TaskStatus.EN_ROUTE:
        // Assume they accepted it if they jump straight to en_route
        if (!task.acceptedAt) updateData.acceptedAt = now;
        if (task.distanceToSceneKm == null) {
          Object.assign(updateData, this.sceneLeg(task, vehicleLat, vehicleLng, sceneLat, sceneLng));
        }
        break;
      case TaskStatus.AT_SCENE:
        updateData.sceneArrivalAt = now;
        break;
      case TaskStatus.PATIENT_PICKED:
        updateData.patientPickAt = now;
        Object.assign(updateData, this.facilityLeg(task, sceneLat, sceneLng));
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
    this.app.io
      .to([...taskCrewIds(task).map((id) => `user:${id}`), `role:${Role.DISPATCHER}`])
      .emit('task:updated', updatedTask);

    // Push the other crew on this task (fire-and-forget) - e.g. the EMT/nurse
    // find out the driver marked them en route without needing the app open.
    this.notifyCrewOfStatusPush(
      taskCrewIds(task),
      user.userId,
      task.incident.caseNumber,
      newStatus,
    );

    return updatedTask;
  }

  /** Ambulance tracker → scene, captured when the crew accepts. */
  private sceneLeg(
    task: { distanceToSceneKm: number | null },
    vehicleLat: number | null,
    vehicleLng: number | null,
    sceneLat: number | null,
    sceneLng: number | null,
  ) {
    if (task.distanceToSceneKm != null) return {};
    if (vehicleLat == null || vehicleLng == null || sceneLat == null || sceneLng == null) return {};
    return {
      startLat: vehicleLat,
      startLng: vehicleLng,
      distanceToSceneKm: Math.round(haversineDistance(vehicleLat, vehicleLng, sceneLat, sceneLng) * 10) / 10,
    };
  }

  /** Scene → recommended facility, captured when the patient is picked up. */
  private facilityLeg(
    task: { sceneToFacilityKm: number | null; incident: { targetFacility: { lat: number; lng: number } | null } },
    sceneLat: number | null,
    sceneLng: number | null,
  ) {
    if (task.sceneToFacilityKm != null) return {};
    const facility = task.incident.targetFacility;
    if (sceneLat == null || sceneLng == null || !facility) return {};
    return {
      endLat: facility.lat,
      endLng: facility.lng,
      sceneToFacilityKm: Math.round(haversineDistance(sceneLat, sceneLng, facility.lat, facility.lng) * 10) / 10,
    };
  }

  /**
   * Returns the active (non-completed, non-cancelled) task for the current responder.
   */
  async getActiveTask(userId: string) {
    const task = await this.app.prisma.task.findFirst({
      where: {
        OR: [{ driverId: userId }, { emtId: userId }, { emt2Id: userId }, { nurseId: userId }, { nurse2Id: userId }],
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
      },
      include: {
        // The crew app shows the recommended facility on the case and the map.
        incident: { include: { targetFacility: { select: { id: true, name: true, lat: true, lng: true } } } },
        vehicle: { select: { id: true, registrationNumber: true, imei: true } },
        ...taskCrewInclude,
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
          OR: [{ driverId: userId }, { emtId: userId }, { emt2Id: userId }, { nurseId: userId }, { nurse2Id: userId }],
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
          OR: [{ driverId: userId }, { emtId: userId }, { emt2Id: userId }, { nurseId: userId }, { nurse2Id: userId }],
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

    const isCrew = taskCrewIds(task).includes(userId);
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

    const isCrew = taskCrewIds(task).includes(user.userId);
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
    task: {
      incidentId: string;
      driverId: string;
      emtId: string | null;
      emt2Id: string | null;
      nurseId: string | null;
      nurse2Id: string | null;
    },
    payload: unknown,
  ) {
    this.app.io.to(`role:${Role.DISPATCHER}`).emit(event, payload);
    for (const uid of taskCrewIds(task)) {
      this.app.io.to(`user:${uid}`).emit(event, payload);
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
    const isCrew = taskCrewIds(task).includes(user.userId);
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
