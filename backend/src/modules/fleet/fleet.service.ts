import { FastifyInstance } from 'fastify';
import { Prisma, type CheckInLocationMatch } from '../../generated/prisma/index.js';
import { Coordinates, Role, VehicleStatus } from '../../shared/types/index.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError.js';
import { reverseGeocodePlace } from '../../shared/utils/geocode.js';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { assessCheckInLocation, formatDistance } from './checkin-location.js';
import { PushSenderService } from '../notifications/push-sender.service.js';
import { findReadyUnits } from './readiness.js';
import { clearedCrew, crewInclude, isCrewComplete, slotsForRole, EMT_SLOTS, NURSE_SLOTS, MEDIC_SLOTS, type CrewSlot } from './crew.js';

export class FleetService {
  private pushSender: PushSenderService;

  constructor(private app: FastifyInstance) {
    this.pushSender = new PushSenderService(app);
  }

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

  /**
   * Broadcast crew / check-in changes: the admin console refreshes live, and
   * the crew on board (plus anyone just taken off) see it on their phones -
   * e.g. a medic the driver has just added.
   */
  private emitVehicleCrewUpdate(vehicle: Record<string, unknown>, alsoNotify: (string | null | undefined)[] = []) {
    const crewIds = [vehicle.currentDriverId, ...MEDIC_SLOTS.map((s) => vehicle[s]), ...alsoNotify].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    this.app.io
      ?.to(`role:${Role.DISPATCHER}`)
      .to(`role:${Role.WATCHER}`)
      .to(`role:${Role.ADMIN}`)
      .to(`role:${Role.SUPER_ADMIN}`)
      .to([...new Set(crewIds)].map((id) => `user:${id}`))
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

  private crewSlots(role: Role): readonly CrewSlot[] {
    const slots = slotsForRole(role);
    if (slots.length === 0) throw new BadRequestError('Role cannot check in to a vehicle');
    return slots;
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
   * The driver checks in to a vehicle at shift start (EMTs and nurses don't
   * check in - the driver adds them, see assignCrew). Clears any previous
   * assignment for this driver on other vehicles.
   *
   * The check-in is recorded where the AMBULANCE is - its GPS tracker, else
   * its last live position - with a place name for that spot. The driver's
   * phone location is only evidence: it's compared with the tracker so a
   * driver can't check in from home. The verdict is shown to dispatch and
   * never blocks the check-in or later assignment.
   */
  async checkInToCrew(
    vehicleId: string,
    userId: string,
    role: Role,
    location: {
      lat: number;
      lng: number;
      locationName?: string | null;
      accuracyM?: number | null;
      mocked?: boolean;
      mockCheckAvailable?: boolean;
    },
    selfie: { filename: string; mimetype: string; file: NodeJS.ReadableStream }
  ) {
    if (role !== Role.DRIVER) {
      throw new ForbiddenError("Only the driver checks in. Ask your driver to add you to the ambulance's crew.");
    }
    const slots = this.crewSlots(role);

    const vehicle = await this.app.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundError('Vehicle not found');

    // Where the ambulance is: its own tracker first, else its last live fix.
    // Never the phone - that only verifies the driver is with the vehicle.
    const ambulance =
      vehicle.trackerLat != null && vehicle.trackerLng != null
        ? { lat: vehicle.trackerLat, lng: vehicle.trackerLng }
        : vehicle.lastLat != null && vehicle.lastLng != null
          ? { lat: vehicle.lastLat, lng: vehicle.lastLng }
          : null;

    const verdict = assessCheckInLocation(
      { lat: location.lat, lng: location.lng, accuracyM: location.accuracyM, mocked: location.mocked },
      { lat: vehicle.trackerLat, lng: vehicle.trackerLng, at: vehicle.trackerAt },
    );

    // One driver per ambulance: if another driver holds the seat, it's taken.
    if (vehicle.currentDriverId && vehicle.currentDriverId !== userId) {
      const holder = await this.app.prisma.user.findUnique({ where: { id: vehicle.currentDriverId }, select: { name: true } });
      throw new ConflictError(
        `${vehicle.registrationNumber} already has a driver checked in${holder?.name ? ` (${holder.name})` : ''}. Choose another ambulance.`,
      );
    }
    const field = slots[0];

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

    // Place name for the ambulance's position (the phone's own guess is
    // ignored); the vehicle's stored place if it has no position at all.
    const locationName = ambulance
      ? await reverseGeocodePlace(ambulance.lat, ambulance.lng, this.app.config.GOOGLE_MAPS_KEY)
      : vehicle.lastLocationName ?? null;

    // 2. Claim the driver seat atomically: the check above ran before the
    // selfie upload and geocode, so another driver may have taken the seat in
    // the meantime. Only one conditional update can win; the loser gets the
    // same "already has a driver" conflict instead of silently replacing them.
    const claimed = await this.app.prisma.vehicle.updateMany({
      where: { id: vehicleId, OR: [{ [field]: null }, { [field]: userId }] },
      data: {
        [field]: userId,
        ...(role === Role.DRIVER ? { checklistResetAt: new Date() } : {}),
      },
    });
    if (claimed.count === 0) {
      await fs.unlink(storedPath).catch(() => {});
      throw new ConflictError(`${vehicle.registrationNumber} was just taken by another driver. Choose another ambulance.`);
    }

    // 3. Clear user from any other vehicle (or other slot) they previously held
    for (const slot of slots) {
      await this.app.prisma.vehicle.updateMany({
        where: { [slot]: userId, id: { not: vehicleId } },
        data: { [slot]: null },
      });
    }

    // 4. Record the check-in event: selfie, the ambulance's place, the phone
    // fix (lat/lng - verification evidence only), the tracker fix and verdict
    const checkIn = await this.app.prisma.checkIn.create({
      data: {
        vehicleId,
        userId,
        role,
        lat: location.lat,
        lng: location.lng,
        locationName,
        selfiePath: storedName,
        accuracyM: location.accuracyM ?? null,
        mockLocation: location.mocked === true,
        mockCheckAvailable: location.mockCheckAvailable !== false,
        vehicleLat: vehicle.trackerLat,
        vehicleLng: vehicle.trackerLng,
        vehicleFixAt: vehicle.trackerAt,
        distanceM: verdict.distanceM,
        locationMatch: verdict.match,
      },
    });

    // The crew FK was set by the claim in step 2 (which also reset the
    // equipment checklist - it must be reconfirmed each shift). The phone GPS
    // is stored on the CheckIn row only; the live map follows the ambulance
    // tracker, never the driver's check-in location.
    const updated = await this.app.prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      include: crewInclude,
    });

    const verification = {
      checkInLocationMatch: verdict.match,
      checkInDistanceM: verdict.distanceM,
      checkInMockLocation: location.mocked === true,
    };

    if (verdict.match === 'MISMATCH') {
      this.app.log.warn({ vehicleId, userId, role, ...verification, reason: verdict.reason }, 'Check-in away from vehicle tracker');
      this.app.io
        ?.to(`role:${Role.DISPATCHER}`)
        .to(`role:${Role.ADMIN}`)
        .to(`role:${Role.SUPER_ADMIN}`)
        .emit('fleet:checkin-alert', {
          checkInId: checkIn.id,
          vehicleId,
          registrationNumber: updated.registrationNumber,
          userId,
          userName: (await this.app.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? null,
          role,
          locationName,
          distanceM: verdict.distanceM,
          reason: verdict.reason,
          message:
            verdict.reason === 'mock_location'
              ? `${updated.registrationNumber}: check-in used a fake GPS location`
              : `${updated.registrationNumber}: checked in ${formatDistance(verdict.distanceM!)} from the ambulance`,
          checkedInAt: checkIn.checkedInAt,
        });
    }

    this.emitVehicleCrewUpdate({
      ...updated,
      checkedInAt: checkIn.checkedInAt,
      checkInLocationName: locationName,
      ...(role === Role.DRIVER ? verification : {}),
    });
    return {
      ...updated,
      checkInLocationName: locationName,
      checkInLat: ambulance?.lat ?? null,
      checkInLng: ambulance?.lng ?? null,
      checkedInAt: checkIn.checkedInAt,
      ...verification,
    };
  }

  /**
   * Crew member checks out of a vehicle (on logout or end of shift).
   */
  async checkOutFromCrew(vehicleId: string, userId: string, role: Role) {
    const vehicle = await this.app.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundError('Vehicle not found');
    const field = this.crewSlots(role).find((s) => vehicle[s] === userId);
    if (!field) {
      throw new ForbiddenError('You are not checked in to this vehicle');
    }
    // A driver hands the ambulance back empty: medics are removed first, so
    // nobody is left "on" a unit without a driver.
    if (role === Role.DRIVER && MEDIC_SLOTS.some((s) => vehicle[s])) {
      throw new BadRequestError('Remove your EMTs and nurses from the crew before ending your shift.');
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
    const before = await this.app.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    const updated = await this.app.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        ...clearedCrew,
        status: VehicleStatus.READY,
      },
      include: crewInclude,
    });
    this.emitVehicleCrewUpdate(updated, before ? [before.currentDriverId, ...MEDIC_SLOTS.map((s) => before[s])] : []);
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

    // Attach latest driver check-in per vehicle (for "logged in since …" and
    // whether it was made at the ambulance)
    const checkIns = await this.driverCheckIns(vehicles);
    return vehicles.map((v) => {
      const c = checkIns.get(v.id);
      if (!c) return v;
      return { ...v, ...c, checkInLocationName: c.checkInLocationName ?? v.lastLocationName };
    });
  }

  /**
   * The current driver's check-in on each vehicle: when, where, and how it
   * compared with the vehicle's tracker. Vehicles without a driver, or whose
   * latest driver check-in belongs to someone else, are left out.
   */
  async driverCheckIns(vehicles: { id: string; currentDriverId?: string | null }[]) {
    const withDrivers = vehicles.filter((v) => v.currentDriverId);
    const out = new Map<string, {
      checkedInAt: Date;
      checkInLocationName: string | null;
      checkInLocationMatch: CheckInLocationMatch;
      checkInDistanceM: number | null;
      checkInMockLocation: boolean;
    }>();
    if (withDrivers.length === 0) return out;

    const rows = await this.app.prisma.checkIn.findMany({
      where: { vehicleId: { in: withDrivers.map((v) => v.id) }, role: Role.DRIVER },
      orderBy: { checkedInAt: 'desc' },
      distinct: ['vehicleId'],
      select: {
        vehicleId: true,
        userId: true,
        checkedInAt: true,
        locationName: true,
        locationMatch: true,
        distanceM: true,
        mockLocation: true,
      },
    });
    const driverOf = new Map(withDrivers.map((v) => [v.id, v.currentDriverId]));
    for (const c of rows) {
      if (driverOf.get(c.vehicleId) !== c.userId) continue;
      out.set(c.vehicleId, {
        checkedInAt: c.checkedInAt,
        checkInLocationName: c.locationName,
        checkInLocationMatch: c.locationMatch,
        checkInDistanceM: c.distanceM,
        checkInMockLocation: c.mockLocation,
      });
    }
    return out;
  }

  /**
   * Vehicle the current user is checked in to, if any - plus their latest check-in place.
   */
  async getMyCheckIn(userId: string, role: Role) {
    const vehicle = await this.app.prisma.vehicle.findFirst({
      where: { OR: this.crewSlots(role).map((s) => ({ [s]: userId })), isActive: true },
      include: crewInclude,
    });
    if (!vehicle) return null;

    const latest = await this.app.prisma.checkIn.findFirst({
      where: { vehicleId: vehicle.id, userId },
      orderBy: { checkedInAt: 'desc' },
      select: { vehicleLat: true, vehicleLng: true, locationName: true, checkedInAt: true, locationMatch: true, distanceM: true, mockLocation: true },
    });

    // Where the ambulance was at check-in (its tracker), else where it is now.
    // The phone fix on the CheckIn row is verification evidence only.
    const atCheckIn = latest?.vehicleLat != null && latest.vehicleLng != null;
    return {
      ...vehicle,
      checkInLocationName: latest?.locationName ?? vehicle.lastLocationName ?? null,
      checkInLat: atCheckIn ? latest!.vehicleLat : (vehicle.trackerLat ?? vehicle.lastLat ?? null),
      checkInLng: atCheckIn ? latest!.vehicleLng : (vehicle.trackerLng ?? vehicle.lastLng ?? null),
      checkedInAt: latest?.checkedInAt ?? null,
      checkInLocationMatch: latest?.locationMatch ?? null,
      checkInDistanceM: latest?.distanceM ?? null,
      checkInMockLocation: latest?.mockLocation ?? false,
    };
  }

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

  /**
   * EMT / nurse users in an agency that a driver can pick from when assigning
   * crew. `onVehicle` is the ambulance a medic is already crewing (if any) -
   * the picker shows them locked, and assignCrew refuses them.
   */
  async listAssignableCrew(agencyId: string) {
    const [members, vehicles] = await Promise.all([
      this.app.prisma.user.findMany({
        where: { agencyId, isActive: true, role: { in: [Role.EMT, Role.NURSE] } },
        select: { id: true, name: true, phone: true, role: true },
        orderBy: { name: 'asc' },
      }),
      this.app.prisma.vehicle.findMany({
        where: { OR: MEDIC_SLOTS.map((slot) => ({ [slot]: { not: null } })) },
        select: { id: true, registrationNumber: true, currentEmtId: true, currentEmt2Id: true, currentNurseId: true, currentNurse2Id: true },
      }),
    ]);

    const onVehicle = new Map<string, { id: string; registrationNumber: string }>();
    for (const v of vehicles) {
      for (const slot of MEDIC_SLOTS) {
        const id = v[slot];
        if (id) onVehicle.set(id, { id: v.id, registrationNumber: v.registrationNumber });
      }
    }
    return members.map((m) => ({ ...m, onVehicle: onVehicle.get(m.id) ?? null }));
  }

  /**
   * Driver (or admin) sets or clears the medic slots on their vehicle. Passing
   * an id sets that slot; null clears it; omitting the key leaves it unchanged.
   */
  async assignCrew(
    vehicleId: string,
    actor: { userId: string; role: Role; agencyId?: string },
    crew: { emtId?: string | null; emt2Id?: string | null; nurseId?: string | null; nurse2Id?: string | null },
  ) {
    const vehicle = await this.app.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundError('Vehicle');

    const isAdmin = (<Role[]>[Role.ADMIN, Role.SUPER_ADMIN]).includes(actor.role);
    const isVehicleDriver = vehicle.currentDriverId === actor.userId;
    if (!isAdmin && !isVehicleDriver) {
      throw new ForbiddenError('Only the checked-in driver can assign crew for this vehicle');
    }

    const requested = [
      { key: 'emtId', slot: EMT_SLOTS[0], role: Role.EMT, label: 'EMT' },
      { key: 'emt2Id', slot: EMT_SLOTS[1], role: Role.EMT, label: 'EMT' },
      { key: 'nurseId', slot: NURSE_SLOTS[0], role: Role.NURSE, label: 'Nurse' },
      { key: 'nurse2Id', slot: NURSE_SLOTS[1], role: Role.NURSE, label: 'Nurse' },
    ] as const;

    const data: Partial<Record<CrewSlot, string | null>> = {};
    const placed = new Map<string, CrewSlot>();

    for (const r of requested) {
      const id = crew[r.key];
      if (id === undefined) continue;
      if (id === null) {
        data[r.slot] = null;
        continue;
      }
      if (placed.has(id)) throw new BadRequestError('The same person cannot fill two crew slots');
      const member = await this.app.prisma.user.findUnique({ where: { id } });
      if (!member || !member.isActive || member.role !== r.role) {
        throw new BadRequestError(`Selected ${r.label} is invalid or inactive`);
      }
      if (member.agencyId !== vehicle.agencyId) {
        throw new BadRequestError(`${r.label} must belong to the same agency as the vehicle`);
      }
      placed.set(id, r.slot);
      data[r.slot] = id;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestError('Provide emtId, emt2Id, nurseId and/or nurse2Id to update');
    }

    // A medic moved between slots on this vehicle vacates the old slot.
    for (const [id, target] of placed) {
      for (const slot of MEDIC_SLOTS) {
        if (slot !== target && vehicle[slot] === id && !(slot in data)) data[slot] = null;
      }
    }

    // A medic already crewing another ambulance can't be taken from it - that
    // driver would silently lose them. The check and the write share one
    // serializable transaction, so two drivers picking the same medic at the
    // same moment can't both succeed.
    let updated;
    try {
      updated = await this.app.prisma.$transaction(
        async (tx) => {
          if (placed.size > 0) {
            const ids = [...placed.keys()];
            const elsewhere = await tx.vehicle.findFirst({
              where: {
                NOT: { id: vehicleId },
                OR: MEDIC_SLOTS.map((slot) => ({ [slot]: { in: ids } })),
              },
              select: { registrationNumber: true, currentEmtId: true, currentEmt2Id: true, currentNurseId: true, currentNurse2Id: true },
            });
            if (elsewhere) {
              const takenId = MEDIC_SLOTS.map((s) => elsewhere[s]).find((id) => id && placed.has(id));
              const who = takenId ? await tx.user.findUnique({ where: { id: takenId }, select: { name: true } }) : null;
              throw new ConflictError(
                `${who?.name ?? 'This medic'} is already on the crew of ${elsewhere.registrationNumber}. ` +
                  'Their driver must remove them before they can join another ambulance.',
              );
            }
          }
          return tx.vehicle.update({ where: { id: vehicleId }, data, include: crewInclude });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (err) {
      // P2034: the database aborted one of two overlapping assignments.
      if ((err as { code?: string }).code === 'P2034') {
        throw new ConflictError('That medic was just assigned to another ambulance. Refresh and choose someone else.');
      }
      throw err;
    }
    // Medics just taken off this ambulance hear about it too.
    this.emitVehicleCrewUpdate(updated, MEDIC_SLOTS.map((s) => vehicle[s]));

    // Newly added medics get a push: they're on duty now, and calls can come.
    const added = [...placed.keys()].filter((id) => !MEDIC_SLOTS.some((s) => vehicle[s] === id));
    if (added.length > 0) {
      const driver = updated.currentDriver?.name?.trim().split(/\s+/)[0];
      this.pushSender
        .sendToUsers(
          added,
          `You're on the crew of ${updated.registrationNumber}`,
          `${driver ? `${driver} added you` : 'You were added'}. Stay signed in and ready - case alerts for this ambulance now come to you.`,
          { type: 'CREW_ASSIGNED', vehicleId, registrationNumber: updated.registrationNumber },
        )
        .catch((err) => this.app.log.warn({ err }, 'crew assignment push failed'));
    }
    return updated;
  }

  /**
   * READY vehicles in an agency with a complete crew - candidates for
   * handover / case reassignment.
   */
  async listAvailableVehiclesForHandover(agencyId: string, excludeVehicleId?: string) {
    // Same bar as transfer and dispatch: crew, checklist, no open task.
    return findReadyUnits(this.app.prisma, { agencyId, excludeVehicleId });
  }
}
