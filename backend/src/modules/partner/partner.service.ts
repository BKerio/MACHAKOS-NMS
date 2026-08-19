import { FastifyInstance } from 'fastify';
import { IncidentStatus } from '../../shared/types/index.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/AppError.js';

export class PartnerService {
  constructor(private app: FastifyInstance) {}

  /**
   * Returns all incidents forwarded to the partner's agency.
   */
  async getForwardedIncidents(agencyId: string, filters: { page: number; limit: number }) {
    const { page, limit } = filters;
    const skip = (page - 1) * limit;

    const [incidents, total] = await Promise.all([
      this.app.prisma.incident.findMany({
        where: { assignedAgencyId: agencyId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          watcher: { select: { id: true, name: true, phone: true } },
          tasks: {
            include: {
              vehicle: { select: { id: true, registrationNumber: true } },
              driver: { select: { id: true, name: true, phone: true } },
            },
          },
          forwardingLogs: {
            include: {
              fromAgency: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.app.prisma.incident.count({ where: { assignedAgencyId: agencyId } }),
    ]);

    return {
      data: incidents,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * GBV cases forwarded to this partner (#15). Same GBV dashboard view as the EOC,
   * but scoped to the partner's own assigned cases so they never see other cases.
   */
  async getForwardedGbvCases(agencyId: string) {
    return this.app.prisma.incident.findMany({
      where: { assignedAgencyId: agencyId, isGbvCase: true },
      orderBy: { createdAt: 'desc' },
      include: {
        watcher: { select: { id: true, name: true, phone: true } },
        dispatcher: { select: { id: true, name: true, phone: true } },
        gbvReport: true,
      },
    });
  }

  /**
   * Returns a single forwarded incident - validates it belongs to the partner.
   */
  async getForwardedIncidentById(incidentId: string, agencyId: string) {
    const incident = await this.app.prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        watcher: { select: { id: true, name: true, phone: true } },
        tasks: { include: { vehicle: true, driver: { select: { name: true, phone: true } } } },
        forwardingLogs: {
          include: { fromAgency: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        targetFacility: true,
      },
    });

    if (!incident) throw new NotFoundError('Incident');
    if (incident.assignedAgencyId !== agencyId) throw new NotFoundError('Incident');

    return incident;
  }

  /**
   * Partner acknowledges a forwarded incident and moves it to DISPATCH_HANDLING.
   */
  async acceptIncident(incidentId: string, agencyId: string) {
    const incident = await this.app.prisma.incident.findUnique({ where: { id: incidentId } });

    if (!incident) throw new NotFoundError('Incident');
    if (incident.assignedAgencyId !== agencyId) throw new NotFoundError('Incident');

    if (incident.status === IncidentStatus.DISPATCHED || incident.status === IncidentStatus.RESOLVED) {
      throw new BadRequestError(`Incident is already ${incident.status}`);
    }

    const updated = await this.app.prisma.incident.update({
      where: { id: incidentId },
      data: { status: IncidentStatus.DISPATCH_HANDLING },
    });

    // Notify the originating NMS dispatchers
    this.app.io.to(`incident:${incidentId}`).emit('incident:update', updated);

    return updated;
  }

  /**
   * Partner updates an incident's status (e.g. DISPATCHED, RESOLVED).
   */
  async updateIncidentStatus(incidentId: string, agencyId: string, status: IncidentStatus, comments?: string) {
    const incident = await this.app.prisma.incident.findUnique({ where: { id: incidentId } });

    if (!incident) throw new NotFoundError('Incident');
    if (incident.assignedAgencyId !== agencyId) throw new NotFoundError('Incident');

    const updated = await this.app.prisma.incident.update({
      where: { id: incidentId },
      data: { status, dispatcherComments: comments },
    });

    this.app.io.to(`incident:${incidentId}`).emit('incident:update', updated);

    return updated;
  }

  /**
   * Partner adds notes and optionally a PCR URL + status update.
   */
  async addPartnerUpdate(
    incidentId: string,
    agencyId: string,
    data: { notes?: string; pcrUrl?: string; status?: IncidentStatus }
  ) {
    const incident = await this.app.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundError('Incident');
    if (incident.assignedAgencyId !== agencyId) throw new NotFoundError('Incident');

    const updated = await this.app.prisma.incident.update({
      where: { id: incidentId },
      data: {
        ...(data.notes !== undefined && { partnerNotes: data.notes }),
        ...(data.pcrUrl !== undefined && { pcrUrl: data.pcrUrl }),
        ...(data.status !== undefined && { status: data.status }),
      },
    });

    this.app.io.to(`incident:${incidentId}`).emit('incident:update', updated);

    return updated;
  }
}
