import { FastifyInstance } from 'fastify';

export class AnalyticsService {
  constructor(private app: FastifyInstance) {}

  async getAnalytics(filters: { from: Date; to: Date }) {
    const { from, to } = filters;
    const where = { createdAt: { gte: from, lte: to } };

    const [
      total,
      byGender,
      bySubCounty,
      byNature,
      byReferral,
      byStatus,
      tasks,
      trendRaw,
      utilizationRaw,
    ] = await Promise.all([
      this.app.prisma.incident.count({ where }),

      this.app.prisma.incident.groupBy({
        by: ['patientGender'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),

      this.app.prisma.incident.groupBy({
        by: ['subCounty'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 8,
      }),

      this.app.prisma.incident.groupBy({
        by: ['alertNature'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),

      this.app.prisma.$queryRaw<Array<{ facility: string; count: bigint }>>`
        SELECT place_of_referral AS facility, COUNT(*) AS count
        FROM incidents
        WHERE created_at >= ${from} AND created_at <= ${to}
          AND place_of_referral IS NOT NULL AND place_of_referral <> ''
        GROUP BY place_of_referral
        ORDER BY count DESC
        LIMIT 8
      `,

      this.app.prisma.incident.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),

      this.app.prisma.task.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
          receivedAt: true,
          acceptedAt: true,
          sceneArrivalAt: true,
          facilityArrivalAt: true,
          completedAt: true,
          status: true,
        },
      }),

      this.app.prisma.incident.findMany({
        where,
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),

      this.app.prisma.$queryRaw<Array<{ registration: string; count: bigint }>>`
        SELECT v.registration_number AS registration, COUNT(t.id) AS count
        FROM tasks t
        JOIN vehicles v ON v.id = t.vehicle_id
        WHERE t.created_at >= ${from} AND t.created_at <= ${to}
        GROUP BY v.registration_number
        ORDER BY count DESC
        LIMIT 15
      `,
    ]);

    // TAT averages in minutes
    const avg = (arr: number[]) =>
      arr.length > 0
        ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
        : null;

    const dispatchTimes = tasks
      .filter(t => t.acceptedAt)
      .map(t => (t.acceptedAt!.getTime() - t.receivedAt.getTime()) / 60000);

    const sceneTimes = tasks
      .filter(t => t.acceptedAt && t.sceneArrivalAt)
      .map(t => (t.sceneArrivalAt!.getTime() - t.acceptedAt!.getTime()) / 60000);

    const hospitalTimes = tasks
      .filter(t => t.sceneArrivalAt && t.facilityArrivalAt)
      .map(t => (t.facilityArrivalAt!.getTime() - t.sceneArrivalAt!.getTime()) / 60000);

    // Daily incident trend - bucket by Nairobi calendar day (not UTC), so incidents
    // in the first hours of the local day aren't counted on the previous day.
    const nairobiDay = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const trendMap: Record<string, number> = {};
    for (const inc of trendRaw) {
      const day = nairobiDay.format(inc.createdAt);
      trendMap[day] = (trendMap[day] ?? 0) + 1;
    }
    const trend = Object.entries(trendMap).map(([date, count]) => ({ date, count }));

    return {
      total,
      byGender: byGender.map(g => ({
        gender: g.patientGender || 'Unknown',
        count: g._count.id,
      })),
      bySubCounty: bySubCounty.map(s => ({
        subCounty: s.subCounty,
        count: s._count.id,
      })),
      byNature: byNature.map(n => ({
        nature: n.alertNature || 'Unspecified',
        count: n._count.id,
      })),
      byReferral: (byReferral as Array<{ facility: string; count: bigint }>).map(r => ({
        facility: r.facility,
        count: Number(r.count),
      })),
      byStatus: byStatus.map(s => ({
        status: s.status as string,
        count: s._count.id,
      })),
      tat: {
        avgDispatchMinutes: avg(dispatchTimes),
        avgSceneMinutes: avg(sceneTimes),
        avgHospitalMinutes: avg(hospitalTimes),
      },
      trend,
      ambulanceUtilization: (utilizationRaw as Array<{ registration: string; count: bigint }>).map(u => ({
        ambulance: u.registration,
        cases: Number(u.count),
      })),
    };
  }
}