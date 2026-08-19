import { FastifyInstance } from 'fastify';
import { haversineDistance } from '../../shared/utils/haversine.js';
import { FleetService } from '../fleet/fleet.service.js';
import { IncidentStatus, Role, TaskStatus } from '../../shared/types/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError.js';

export class DispatchService {
  private fleetService: FleetService;

  constructor(private app: FastifyInstance) {
    this.fleetService = new FleetService(app);
  }

  /**
   * Real fleet operational breakdown, derived from vehicle flags + each
   * vehicle's current active (non-terminal) task.
   */
  async getFleetStatus() {
    const [vehicles, activeTasks] = await Promise.all([
      this.app.prisma.vehicle.findMany({ select: { id: true, isActive: true, status: true } }),
      this.app.prisma.task.findMany({
        where: { status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] } },
        select: { vehicleId: true, status: true },
      }),
    ]);

    const taskByVehicle = new Map<string, string>();
    for (const t of activeTasks) taskByVehicle.set(t.vehicleId, t.status);

    const counts = {
      READY: 0, DISPATCHED: 0, ON_SCENE: 0, RETURNING: 0, OFFLINE: 0, MAINTENANCE: 0,
      total: vehicles.length,
    };

    for (const v of vehicles) {
      if (!v.isActive) { counts.OFFLINE++; continue; }
      if (v.status === 'MAINTENANCE') { counts.MAINTENANCE++; continue; }
      const ts = taskByVehicle.get(v.id);
      if (!ts) { counts.READY++; continue; }
      if (ts === TaskStatus.AT_SCENE) counts.ON_SCENE++;
      else if (ts === TaskStatus.PATIENT_PICKED || ts === TaskStatus.AT_HOSPITAL) counts.RETURNING++;
      else counts.DISPATCHED++; // PENDING / ACCEPTED / EN_ROUTE
    }

    return counts;
  }

  /**
   * Returns all incidents awaiting dispatch (status: SUBMITTED).
   */
  async getQueue() {
    return this.app.prisma.incident.findMany({
      where: { status: IncidentStatus.SUBMITTED },
      orderBy: { createdAt: 'asc' },
      include: {
        watcher: { select: { id: true, name: true, phone: true } },
        assignedAgency: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Dispatcher claims an incident - moves it to DISPATCH_HANDLING.
   */
  async assignDispatcher(incidentId: string, user: { userId: string; role: Role }) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('Only dispatchers can claim incidents');
    }

    const incident = await this.app.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundError('Incident not found');

    if (incident.status !== IncidentStatus.SUBMITTED) {
      throw new BadRequestError(`Incident is already ${incident.status} - cannot claim`);
    }

    const updated = await this.app.prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: IncidentStatus.DISPATCH_HANDLING,
        dispatcherId: user.userId,
      },
      include: {
        watcher: { select: { id: true, name: true } },
        dispatcher: { select: { id: true, name: true } },
      },
    });

    this.app.io.to(`incident:${incidentId}`).emit('incident:update', updated);
    this.app.io.to(`role:${Role.WATCHER}`).emit('incident:update', updated);

    return updated;
  }

  /**
   * Dispatches an incident to a partner / offline ambulance - a unit with no GPS
   * tracker, no crew user accounts, and no mobile app.
   *
   * Deliberately does NOT create a Task. `Task` requires both a `vehicleId` FK
   * into `vehicles` and a `driverId` FK into `users`; a partner ambulance has
   * neither, and there is no responder app to drive the task lifecycle
   * (ACCEPTED → AT_SCENE → …) anyway. Instead the assignment is recorded on the
   * incident itself via `ambulanceUsed`, which is the same field the EOC export's
   * "Ambulance used" column already reads - matching how these dispatches were
   * recorded in the legacy spreadsheet.
   *
   * Consequence to be aware of: because there's no Task, these cases produce no
   * automated TAT timings. The dispatcher closes them manually via Resolve.
   */
  async assignOfflineAmbulance(
    incidentId: string,
    user: { userId: string; role: Role },
    data: { partnerAmbulanceId: string; notes?: string },
  ) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('Only dispatchers can dispatch ambulances');
    }

    const [incident, ambulance] = await Promise.all([
      this.app.prisma.incident.findUnique({ where: { id: incidentId } }),
      this.app.prisma.partnerAmbulance.findUnique({
        where: { id: data.partnerAmbulanceId },
        include: { agency: { select: { id: true, name: true } } },
      }),
    ]);

    if (!incident) throw new NotFoundError('Incident not found');
    if (!ambulance) throw new NotFoundError('Partner ambulance not found');
    if (!ambulance.isActive) throw new BadRequestError('That ambulance is marked inactive');
    if (incident.status === IncidentStatus.RESOLVED) {
      throw new BadRequestError('Case is already resolved - cannot dispatch');
    }

    // Human-readable label, e.g. "KDA 123X (Kenya Red Cross)" - this is what
    // lands in the export's "Ambulance used" column.
    const label = [
      ambulance.registrationNumber,
      ambulance.agency?.name ? `(${ambulance.agency.name})` : null,
    ].filter(Boolean).join(' ');

    const updated = await this.app.prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: IncidentStatus.DISPATCHED,
        dispatcherId: incident.dispatcherId ?? user.userId,
        ambulanceUsed: label,
        ...(data.notes?.trim() ? { dispatcherComments: data.notes.trim() } : {}),
      },
      include: {
        watcher: { select: { id: true, name: true } },
        dispatcher: { select: { id: true, name: true } },
      },
    });

    this.app.io.to(`incident:${incidentId}`).emit('incident:update', updated);
    this.app.io.to(`role:${Role.WATCHER}`).emit('incident:update', updated);
    this.app.io.to(`role:${Role.DISPATCHER}`).emit('incident:update', updated);

    return updated;
  }

  /**
   * Forwards an incident to a partner agency.
   */
  async handoffToPartner(
    incidentId: string,
    user: { userId: string; role: Role; agencyId: string },
    data: { toAgencyId: string; reason: string }
  ) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('Only dispatchers can forward incidents');
    }

    const [incident, toAgency] = await Promise.all([
      this.app.prisma.incident.findUnique({ where: { id: incidentId } }),
      this.app.prisma.agency.findUnique({ where: { id: data.toAgencyId } }),
    ]);

    if (!incident) throw new NotFoundError('Incident not found');
    if (!toAgency) throw new NotFoundError('Partner agency not found');

    const [updatedIncident, log] = await this.app.prisma.$transaction([
      this.app.prisma.incident.update({
        where: { id: incidentId },
        data: { assignedAgencyId: data.toAgencyId },
      }),
      this.app.prisma.forwardingLog.create({
        data: {
          incidentId,
          fromAgencyId: user.agencyId,
          toAgencyId: data.toAgencyId,
          reason: data.reason,
        },
      }),
    ]);

    this.app.io.to(`agency:${data.toAgencyId}`).emit('incident:forwarded', {
      incident: updatedIncident,
      log,
    });

    return { incident: updatedIncident, log };
  }

  /**
   * Finds the nearest active vehicles to a given incident coordinate.
   */
  async findNearestVehicles(lat: number, lng: number, agencyId?: string, limit: number = 5) {
    const allLocations = await this.fleetService.getAllActiveVehicleLocations();

    const crewInclude = {
      currentDriver: { select: { id: true, name: true, phone: true } },
      currentEmt:    { select: { id: true, name: true, phone: true } },
      currentNurse:  { select: { id: true, name: true, phone: true } },
    } as const;

    if (allLocations.length > 0) {
      const availableVehicles = allLocations.filter(v => {
        const isAvailable = v.isActive === true;
        const matchesAgency = agencyId ? v.agencyId === agencyId : true;
        return isAvailable && matchesAgency;
      });

      const vehiclesWithDistance = availableVehicles.map(v => ({
        id: v.vehicleId,
        registrationNumber: v.registration,
        agencyId: v.agencyId,
        isActive: v.isActive,
        // The dispatcher UI filters candidates on `status === 'READY'`, so this
        // MUST be returned - the Redis payload carries it as `dbStatus`.
        status: v.dbStatus,
        lastLat: v.lat,
        lastLng: v.lng,
        lastLocationAt: v.timestamp,
        distanceKm: haversineDistance(lat, lng, v.lat, v.lng),
      }));

      vehiclesWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);
      const top = vehiclesWithDistance.slice(0, limit);

      // Enrich with crew data from DB
      const crewRows = await this.app.prisma.vehicle.findMany({
        where: { id: { in: top.map(v => v.id) } },
        select: { id: true, ...crewInclude },
      });
      const crewMap = new Map(crewRows.map(r => [r.id, r]));

      return top.map(v => ({
        ...v,
        currentDriver: crewMap.get(v.id)?.currentDriver ?? null,
        currentEmt:    crewMap.get(v.id)?.currentEmt    ?? null,
        currentNurse:  crewMap.get(v.id)?.currentNurse  ?? null,
      }));
    }

    // Redis empty - fall back to DB vehicles with crew data
    const where = agencyId ? { isActive: true, agencyId } : { isActive: true };
    const dbVehicles = await this.app.prisma.vehicle.findMany({
      where,
      take: limit,
      orderBy: { registrationNumber: 'asc' },
      include: crewInclude,
    });

    return dbVehicles.map(v => ({
      id: v.id,
      registrationNumber: v.registrationNumber,
      agencyId: v.agencyId,
      isActive: v.isActive,
      // Required by the dispatcher UI's `status === 'READY'` filter. Without it
      // no vehicle is ever offered for dispatch when Redis/GPS is unavailable.
      status: v.status,
      lastLat: v.lastLat,
      lastLng: v.lastLng,
      lastLocationAt: v.lastLocationAt,
      distanceKm: null,
      currentDriver: v.currentDriver,
      currentEmt:    v.currentEmt,
      currentNurse:  v.currentNurse,
    }));
  }
}
