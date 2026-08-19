import { FastifyInstance } from 'fastify';
import { Prisma } from '../../generated/prisma/index.js';
import { Coordinates, Role, VehicleStatus } from '../../shared/types/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError.js';
import { reverseGeocodePlace } from '../../shared/utils/geocode.js';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';

const crewInclude = {
  currentDriver: { select: { id: true, name: true, phone: true } },
  currentEmt: { select: { id: true, name: true, phone: true } },
  currentNurse: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.VehicleInclude;

export class FleetService {
  constructor(private app: FastifyInstance) {}

  /**
   * Updates a vehicle's real-time location in Redis + Postgres, and broadcasts
   * to dispatch/watcher rooms so live maps stay current (phone GPS or MDT).
   */
  async updateVehicleLocation(imei: string, lat: number, lng: number, locationName?: string | null) {
    const vehicle = await this.app.prisma.vehicle.findUnique({
      where: { imei },
      select: {
        id: true,
        isActive: true,
        agencyId: true,
        registrationNumber: true,
        status: true,
        currentDriverId: true,
        lastLocationName: true,
      },
    });

    if (!vehicle) {
      throw new NotFoundError(`Vehicle with IMEI ${imei} not found`);
    }

    const timestamp = new Date().toISOString();
    const place = locationName?.trim() || vehicle.lastLocationName || null;
    const cacheKey = `vehicle:${imei}:location`;
    const payload = {
      lat,
      lng,
      timestamp,
      vehicleId: vehicle.id,
      registration: vehicle.registrationNumber,
      agencyId: vehicle.agencyId,
      isActive: vehicle.isActive,
      imei,
      speed: 0,
      heading: 0,
      ignition: true,
      dbStatus: vehicle.status,
      hasDriver: !!vehicle.currentDriverId,
      locationName: place,
    };

    await this.app.prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        lastLat: lat,
        lastLng: lng,
        lastLocationAt: new Date(timestamp),
        ...(locationName?.trim() ? { lastLocationName: locationName.trim() } : {}),
      },
    });

    if (this.app.redis) {
      await this.app.redis.set(cacheKey, JSON.stringify(payload), 'EX', 300);
    }

    this.app.io
      ?.to(`role:${Role.DISPATCHER}`)
      .to(`role:${Role.WATCHER}`)
      .to(`role:${Role.ADMIN}`)
      .to(`role:${Role.SUPER_ADMIN}`)
      .emit('fleet:pos', [payload]);

    return payload;
  }

  /** Broadcast crew / check-in changes so the admin console refreshes live. */
  private emitVehicleCrewUpdate(vehicle: unknown) {
    this.app.io
      ?.to(`role:${Role.DISPATCHER}`)
      .to(`role:${Role.WATCHER}`)
      .to(`role:${Role.ADMIN}`)
      .to(`role:${Role.SUPER_ADMIN}`)
      .emit('vehicle:crew', vehicle);
  }

  async getVehicleLocation(imei: string): Promise<(Coordinates & { timestamp: string }) | null> {
    if (!this.app.redis) return null;
    const cacheKey = `vehicle:${imei}:location`;
    const data = await this.app.redis.get(cacheKey);
    if (!data) return null;
    return JSON.parse(data);
  }

  async getAllActiveVehicleLocations() {
    if (!this.app.redis) return [];
    const keys = await this.app.redis.keys('vehicle:*:location');
    if (keys.length === 0) return [];
    const rawData = await this.app.redis.mget(keys);
    return rawData
      .filter((data): data is string => data !== null)
      .map(data => JSON.parse(data));
  }

  private crewField(role: Role): 'currentDriverId' | 'currentEmtId' | 'currentNurseId' {
    if (role === Role.DRIVER) return 'currentDriverId';
    if (role === Role.EMT) return 'currentEmtId';
    if (role === Role.NURSE) return 'currentNurseId';
    throw new BadRequestError('Role cannot check in to a vehicle');
  }

  private checkinDir() {
    return path.resolve(process.cwd(), 'uploads', 'checkins');
  }

  private async ensureCheckinDir() {
    await fs.mkdir(this.checkinDir(), { recursive: true });
  }

  /** Absolute path to a stored check-in selfie (for streaming back to the web app). */
  async getCheckIn(id: string) {
    const checkIn = await this.app.prisma.checkIn.findUnique({ where: { id } });
    if (!checkIn) throw new NotFoundError('Check-in not found');
    return checkIn;
  }

  checkinSelfieAbsolutePath(selfiePath: string) {
    return path.resolve(this.checkinDir(), path.basename(selfiePath));
  }

  /** Recent check-in events, for dispatcher/admin accountability views. */
  async listCheckIns(filter: { vehicleId?: string; limit?: number }) {
    return this.app.prisma.checkIn.findMany({
      where: filter.vehicleId ? { vehicleId: filter.vehicleId } : {},
      orderBy: { checkedInAt: 'desc' },
      take: Math.min(filter.limit ?? 50, 200),
      include: {
        user: { select: { id: true, name: true, phone: true, role: true } },
        vehicle: { select: { id: true, registrationNumber: true } },
      },
    });
  }

  /**
   * Crew member (driver/EMT/nurse) checks in to a vehicle at shift start.
   * Clears any previous assignment for this user on other vehicles.
   * Auto-captures GPS and a human place name (e.g. "Kilimani").
   */
  async checkInToCrew(
    vehicleId: string,
    userId: string,
    role: Role,
    location: { lat: number; lng: number; locationName?: string | null },
    selfie: { filename: string; mimetype: string; file: NodeJS.ReadableStream }
  ) {
    const field = this.crewField(role);

    const vehicle = await this.app.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundError('Vehicle not found');

    // 1. Persist the accountability selfie to disk
    await this.ensureCheckinDir();
    const ext = path.extname(selfie.filename) || '.jpg';
    const safeExt = ext.length <= 10 ? ext : '.jpg';
    const storedName = `${userId}-${Date.now()}${safeExt}`;
    const storedPath = path.join(this.checkinDir(), storedName);

    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(storedPath);
      selfie.file.pipe(out);
      out.on('finish', () => resolve());
      out.on('error', reject);
      selfie.file.on('error', reject);
    });

    // Resolve place name: client-provided first, else Google / OSM reverse geocode
    let locationName = location.locationName?.trim() || null;
    if (!locationName || /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(locationName)) {
      locationName = await reverseGeocodePlace(
        location.lat,
        location.lng,
        this.app.config.GOOGLE_MAPS_KEY,
      );
    }

    // 2. Clear user from any vehicle they were previously checked into
    await this.app.prisma.vehicle.updateMany({
      where: { [field]: userId },
      data: { [field]: null },
    });

    // 3. Record the check-in event (selfie + GPS + place name at shift start)
    const checkIn = await this.app.prisma.checkIn.create({
      data: {
        vehicleId,
        userId,
        role,
        lat: location.lat,
        lng: location.lng,
        locationName,
        selfiePath: storedName,
      },
    });

    // 4. Set the crew FK and seed live location from the check-in GPS
    const updated = await this.app.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        [field]: userId,
        lastLat: location.lat,
        lastLng: location.lng,
        lastLocationAt: new Date(),
        lastLocationName: locationName,
      },
      include: crewInclude,
    });

    // Keep Redis + admin live map in sync with the check-in fix
    try {
      await this.updateVehicleLocation(updated.imei, location.lat, location.lng, locationName);
    } catch (err) {
      this.app.log.warn({ err, vehicleId }, 'Failed to cache check-in location');
    }

    this.emitVehicleCrewUpdate({
      ...updated,
      checkedInAt: checkIn.checkedInAt,
      checkInLocationName: locationName,
    });
    return {
      ...updated,
      checkInLocationName: locationName,
      checkInLat: location.lat,
      checkInLng: location.lng,
      checkedInAt: checkIn.checkedInAt,
    };
  }

  /**
   * Crew member checks out of a vehicle (on logout or end of shift).
   */
  async checkOutFromCrew(vehicleId: string, userId: string, role: Role) {
    const field = this.crewField(role);
    const vehicle = await this.app.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundError('Vehicle not found');
    if (vehicle[field] !== userId) {
      throw new ForbiddenError('You are not checked in to this vehicle');
    }

    const updated = await this.app.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { [field]: null },
      include: crewInclude,
    });
    this.emitVehicleCrewUpdate(updated);
    return updated;
  }

  /**
   * Clear all live crew slots on a vehicle (used after handover / case termination).
   */
  async clearVehicleCrew(vehicleId: string) {
    const updated = await this.app.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        currentDriverId: null,
        currentEmtId: null,
        currentNurseId: null,
        status: VehicleStatus.READY,
      },
      include: crewInclude,
    });
    this.emitVehicleCrewUpdate(updated);
    return updated;
  }

  /**
   * Active vehicles for the responder's agency (for shift check-in picker + fleet board).
   * Includes last known GPS / place name so the app can show ambulance locations.
   * Backfills missing place names from lat/lng (best-effort, capped).
   */
  async listAgencyVehicles(agencyId: string) {
    const vehicles = await this.app.prisma.vehicle.findMany({
      where: { agencyId, isActive: true },
      orderBy: { registrationNumber: 'asc' },
      include: crewInclude,
    });

    const needsName = vehicles.filter(
      (v) =>
        v.lastLat != null &&
        v.lastLng != null &&
        (!v.lastLocationName || /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(v.lastLocationName)),
    );

    // Cap reverse-geocode fan-out so list stays snappy
    await Promise.all(
      needsName.slice(0, 8).map(async (v) => {
        try {
          const name = await reverseGeocodePlace(
            v.lastLat!,
            v.lastLng!,
            this.app.config.GOOGLE_MAPS_KEY,
          );
          if (!name) return;
          await this.app.prisma.vehicle.update({
            where: { id: v.id },
            data: { lastLocationName: name },
          });
          v.lastLocationName = name;
        } catch {
          // ignore individual failures
        }
      }),
    );

    // Attach latest driver check-in time per vehicle (for "logged in since …")
    const withDrivers = vehicles.filter((v) => v.currentDriverId);
    if (withDrivers.length > 0) {
      const latestByVehicle = await this.app.prisma.checkIn.findMany({
        where: {
          vehicleId: { in: withDrivers.map((v) => v.id) },
          role: Role.DRIVER,
        },
        orderBy: { checkedInAt: 'desc' },
        distinct: ['vehicleId'],
        select: { vehicleId: true, checkedInAt: true, locationName: true },
      });
      const map = new Map(latestByVehicle.map((c) => [c.vehicleId, c]));
      return vehicles.map((v) => {
        const c = map.get(v.id);
        if (!c) return v;
        return {
          ...v,
          checkedInAt: c.checkedInAt,
          checkInLocationName: c.locationName ?? v.lastLocationName,
        };
      });
    }

    return vehicles;
  }

  /**
   * Vehicle the current user is checked in to, if any - plus their latest check-in place.
   */
  async getMyCheckIn(userId: string, role: Role) {
    const field = this.crewField(role);
    const vehicle = await this.app.prisma.vehicle.findFirst({
      where: { [field]: userId, isActive: true },
      include: crewInclude,
    });
    if (!vehicle) return null;

    const latest = await this.app.prisma.checkIn.findFirst({
      where: { vehicleId: vehicle.id, userId },
      orderBy: { checkedInAt: 'desc' },
      select: { lat: true, lng: true, locationName: true, checkedInAt: true },
    });

    return {
      ...vehicle,
      checkInLocationName: latest?.locationName ?? vehicle.lastLocationName ?? null,
      checkInLat: latest?.lat ?? vehicle.lastLat ?? null,
      checkInLng: latest?.lng ?? vehicle.lastLng ?? null,
      checkedInAt: latest?.checkedInAt ?? null,
    };
  }

  /**
   * Driver assigns (or clears) the EMT / nurse on their vehicle. Passing an id sets
   * that crew member; passing null clears it; omitting the key leaves it unchanged.
   * Only the driver currently checked in to the vehicle (or an admin) may do this.
   */
  // ── Standby deployments (fleet standby reporting, #11) ───────────────────────

  /** Put a vehicle on standby for an event/location. */
  startStandby(
    userId: string,
    data: { vehicleId: string; title: string; location?: string; lat?: number; lng?: number; notes?: string; startedAt?: string },
  ) {
    return this.app.prisma.standbyDeployment.create({
      data: {
        vehicleId: data.vehicleId,
        title: data.title,
        location: data.location,
        lat: data.lat,
        lng: data.lng,
        notes: data.notes,
        startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
        createdById: userId,
      },
      include: { vehicle: { select: { id: true, registrationNumber: true } } },
    });
  }

  /** End an active standby (sets endedAt to now, or a provided time). */
  async endStandby(id: string, endedAt?: string) {
    const row = await this.app.prisma.standbyDeployment.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('Standby deployment');
    return this.app.prisma.standbyDeployment.update({
      where: { id },
      data: { endedAt: endedAt ? new Date(endedAt) : new Date() },
      include: { vehicle: { select: { id: true, registrationNumber: true } } },
    });
  }

  /** Standby report: filter by active state, vehicle, and date range (by startedAt). */
  listStandby(filter: { active?: boolean; vehicleId?: string; from?: string; to?: string }) {
    const where: Record<string, unknown> = {};
    if (filter.active === true) where.endedAt = null;
    if (filter.active === false) where.endedAt = { not: null };
    if (filter.vehicleId) where.vehicleId = filter.vehicleId;
    if (filter.from || filter.to) {
      where.startedAt = {
        ...(filter.from ? { gte: new Date(filter.from) } : {}),
        ...(filter.to ? { lte: new Date(filter.to) } : {}),
      };
    }
    return this.app.prisma.standbyDeployment.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      include: { vehicle: { select: { id: true, registrationNumber: true } } },
    });
  }

  /** Active partner ambulances (reference info for dispatchers; not GPS-tracked). */
  listPartnerAmbulances() {
    return this.app.prisma.partnerAmbulance.findMany({
      where: { isActive: true },
      orderBy: [{ agencyId: 'asc' }, { registrationNumber: 'asc' }],
      include: { agency: { select: { id: true, name: true } } },
    });
  }

  /** EMT / nurse users in an agency that a driver can pick from when assigning crew. */
  listAssignableCrew(agencyId: string) {
    return this.app.prisma.user.findMany({
      where: { agencyId, isActive: true, role: { in: [Role.EMT, Role.NURSE] } },
      select: { id: true, name: true, phone: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  async assignCrew(
    vehicleId: string,
    actor: { userId: string; role: Role; agencyId?: string },
    crew: { emtId?: string | null; nurseId?: string | null },
  ) {
    const vehicle = await this.app.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundError('Vehicle');

    const isAdmin = (<Role[]>[Role.ADMIN, Role.SUPER_ADMIN]).includes(actor.role);
    const isVehicleDriver = vehicle.currentDriverId === actor.userId;
    if (!isAdmin && !isVehicleDriver) {
      throw new ForbiddenError('Only the checked-in driver can assign crew for this vehicle');
    }

    const data: Record<string, string | null> = {};

    if (crew.emtId !== undefined) {
      if (crew.emtId === null) {
        data.currentEmtId = null;
      } else {
        const emt = await this.app.prisma.user.findUnique({ where: { id: crew.emtId } });
        if (!emt || !emt.isActive || emt.role !== Role.EMT) {
          throw new BadRequestError('Selected EMT is invalid or inactive');
        }
        if (emt.agencyId !== vehicle.agencyId) {
          throw new BadRequestError('EMT must belong to the same agency as the vehicle');
        }
        // Clear this EMT from any other vehicle before assigning
        await this.app.prisma.vehicle.updateMany({
          where: { currentEmtId: crew.emtId },
          data: { currentEmtId: null },
        });
        data.currentEmtId = crew.emtId;
      }
    }

    if (crew.nurseId !== undefined) {
      if (crew.nurseId === null) {
        data.currentNurseId = null;
      } else {
        const nurse = await this.app.prisma.user.findUnique({ where: { id: crew.nurseId } });
        if (!nurse || !nurse.isActive || nurse.role !== Role.NURSE) {
          throw new BadRequestError('Selected nurse is invalid or inactive');
        }
        if (nurse.agencyId !== vehicle.agencyId) {
          throw new BadRequestError('Nurse must belong to the same agency as the vehicle');
        }
        await this.app.prisma.vehicle.updateMany({
          where: { currentNurseId: crew.nurseId },
          data: { currentNurseId: null },
        });
        data.currentNurseId = crew.nurseId;
      }
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestError('Provide emtId and/or nurseId to update');
    }

    const updated = await this.app.prisma.vehicle.update({
      where: { id: vehicleId },
      data,
      include: crewInclude,
    });
    this.emitVehicleCrewUpdate(updated);
    return updated;
  }

  /**
   * READY vehicles in an agency that have a checked-in driver - candidates for
   * handover / case reassignment.
   */
  listAvailableVehiclesForHandover(agencyId: string, excludeVehicleId?: string) {
    return this.app.prisma.vehicle.findMany({
      where: {
        agencyId,
        isActive: true,
        status: VehicleStatus.READY,
        currentDriverId: { not: null },
        ...(excludeVehicleId ? { id: { not: excludeVehicleId } } : {}),
      },
      orderBy: { registrationNumber: 'asc' },
      include: crewInclude,
    });
  }

}
