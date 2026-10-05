import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { FuelService } from './fuel.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/AppError.js';

const viewRoles = [Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN];

export const fuelRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const fuelService = new FuelService(app);

  app.addHook('preValidation', app.authenticate);

  /**
   * GET /fuel/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Fleet-wide fuel summary: distance, consumption, mileage, fills and drains.
   */
  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/summary',
    { preValidation: [requireRole(viewRoles)] },
    async (request, reply) => {
      const { from, to } = request.query;
      if (!from || !to) throw new BadRequestError('from and to dates are required');
      const { rows, meta } = await fuelService.getSummary(from, to);
      return reply.send({ ok: true, data: rows, meta });
    }
  );

  /**
   * GET /fuel/distance?date=YYYY-MM-DD
   * Km each ambulance drove in every clock hour of one Nairobi day, with
   * per-ambulance, per-hour and overall totals. Built from our own GPS poll
   * (tracking/distance.ts), so it isn't subject to Uffizio's report throttle.
   */
  app.get<{ Querystring: { date?: string } }>(
    '/distance',
    { preValidation: [requireRole(viewRoles)] },
    async (request, reply) => {
      const date = request.query.date;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestError('date (YYYY-MM-DD) is required');
      const dayStart = new Date(`${date}T00:00:00+03:00`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);

      const [vehicles, rows] = await Promise.all([
        app.prisma.vehicle.findMany({
          where: { isActive: true },
          select: { id: true, registrationNumber: true },
          orderBy: { registrationNumber: 'asc' },
        }),
        app.prisma.vehicleDistanceHour.findMany({
          where: { hourStart: { gte: dayStart, lt: dayEnd } },
          select: { vehicleId: true, hourStart: true, distanceKm: true, source: true },
        }),
      ]);

      const round = (n: number) => Math.round(n * 10) / 10;
      const byVehicle = new Map(vehicles.map((v) => [v.id, { vehicleId: v.id, registrationNumber: v.registrationNumber, hours: Array(24).fill(0) as number[], totalKm: 0 }]));
      const hourTotals = Array(24).fill(0) as number[];
      let odometerRows = 0;
      for (const r of rows) {
        const row = byVehicle.get(r.vehicleId);
        if (!row) continue; // vehicle since deactivated
        const hour = Math.floor((r.hourStart.getTime() - dayStart.getTime()) / 3_600_000);
        row.hours[hour] += r.distanceKm;
        row.totalKm += r.distanceKm;
        hourTotals[hour] += r.distanceKm;
        if (r.source === 'ODOMETER') odometerRows++;
      }
      const out = [...byVehicle.values()]
        .map((v) => ({ ...v, hours: v.hours.map(round), totalKm: round(v.totalKm) }))
        .sort((a, b) => b.totalKm - a.totalKm || a.registrationNumber.localeCompare(b.registrationNumber));

      return reply.send({
        ok: true,
        data: {
          date,
          vehicles: out,
          hourTotals: hourTotals.map(round),
          totalKm: round(hourTotals.reduce((a, b) => a + b, 0)),
          source: rows.length === 0 ? null : odometerRows === rows.length ? 'ODOMETER' : odometerRows > 0 ? 'MIXED' : 'GPS',
        },
      });
    }
  );

  /**
   * GET /fuel/events/:vehicleId?from=&to=
   * Individual fill/drain events for one vehicle - each with litres, location,
   * odometer and before/after tank level.
   */
  app.get<{ Params: { vehicleId: string }; Querystring: { from?: string; to?: string } }>(
    '/events/:vehicleId',
    { preValidation: [requireRole(viewRoles)] },
    async (request, reply) => {
      const { from, to } = request.query;
      if (!from || !to) throw new BadRequestError('from and to dates are required');

      const vehicle = await app.prisma.vehicle.findUnique({
        where: { id: request.params.vehicleId },
        select: { imei: true, registrationNumber: true },
      });
      if (!vehicle) throw new NotFoundError('Vehicle not found');
      if (!vehicle.imei) throw new BadRequestError('That vehicle has no tracker fitted');

      const { events, meta } = await fuelService.getEvents(vehicle.imei, from, to);
      return reply.send({
        ok: true,
        data: events,
        meta: { ...meta, registrationNumber: vehicle.registrationNumber },
      });
    }
  );
};
