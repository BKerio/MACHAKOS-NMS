import { FastifyInstance } from 'fastify';
import { NotFoundError } from '../../shared/errors/AppError.js';

export class HandoffService {
  constructor(private app: FastifyInstance) {}

  async listLogs(filters: {
    incidentId?: string;
    fromAgencyId?: string;
    toAgencyId?: string;
    page: number;
    limit: number;
  }) {
    const { incidentId, fromAgencyId, toAgencyId, page, limit } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (incidentId) where.incidentId = incidentId;
    if (fromAgencyId) where.fromAgencyId = fromAgencyId;
    if (toAgencyId) where.toAgencyId = toAgencyId;

    const [logs, total] = await Promise.all([
      this.app.prisma.forwardingLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          incident: { select: { id: true, caseNumber: true, status: true, chiefComplaint: true } },
          fromAgency: { select: { id: true, name: true } },
          toAgency: { select: { id: true, name: true } },
        },
      }),
      this.app.prisma.forwardingLog.count({ where }),
    ]);

    return { data: logs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getLogById(id: string) {
    const log = await this.app.prisma.forwardingLog.findUnique({
      where: { id },
      include: {
        incident: { select: { id: true, caseNumber: true, status: true, chiefComplaint: true } },
        fromAgency: { select: { id: true, name: true } },
        toAgency: { select: { id: true, name: true } },
      },
    });
    if (!log) throw new NotFoundError('Forwarding log not found');
    return log;
  }
}
