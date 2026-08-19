import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { TaskService } from './task.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { TaskStatus, Role } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';
import path from 'node:path';
import { createReadStream, existsSync } from 'node:fs';

const PCR_ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const taskRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const taskService = new TaskService(app);

  app.addHook('preValidation', app.authenticate);

  /**
   * POST /tasks
   * Dispatch a vehicle to an incident.
   */
  app.post<{
    Body: {
      incidentId: string;
      vehicleId: string;
      dispatcherComments?: string;
    };
  }>(
    '/',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const task = await taskService.createTask(
        { userId: request.user.userId, role: request.user.role },
        request.body
      );
      return reply.status(201).send({ ok: true, data: task });
    }
  );

  /**
   * GET /tasks/active
   * Returns the current responder's active task (non-completed/cancelled).
   */
  app.get(
    '/active',
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE])] },
    async (request, reply) => {
      const task = await taskService.getActiveTask(request.user.userId);
      return reply.send({ ok: true, data: task });
    }
  );

  /**
   * GET /tasks/history?page=1&limit=20
   * Returns paginated completed/cancelled tasks for the current responder.
   */
  app.get<{ Querystring: { page?: string; limit?: string } }>(
    '/history',
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE])] },
    async (request, reply) => {
      const page = request.query.page ? parseInt(request.query.page, 10) : 1;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;
      const result = await taskService.getTaskHistory(request.user.userId, page, limit);
      return reply.send({ ok: true, ...result });
    }
  );

  /**
   * POST /tasks/:id/patient-data
   * Crew logs patient vitals and pre-hospital management notes.
   */
  app.post<{ Params: { id: string }; Body: { preHospitalManagement: string; dispatcherChallenges?: string; handoverVitals?: Record<string, unknown> } }>(
    '/:id/patient-data',
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE])] },
    async (request, reply) => {
      const { preHospitalManagement, dispatcherChallenges, handoverVitals } = request.body;
      if (!preHospitalManagement) throw new BadRequestError('preHospitalManagement is required');

      const result = await taskService.updatePatientData(
        request.params.id,
        request.user.userId,
        { preHospitalManagement, dispatcherChallenges, handoverVitals }
      );
      return reply.send({ ok: true, data: result });
    }
  );

  /**
   * POST /tasks/:id/stops
   * Add a destination stop during a task (e.g. re-route to another facility).
   * Crew (mobile) or dispatcher. Emits task:stop-added for realtime + push.
   */
  app.post<{ Params: { id: string }; Body: { name: string; facilityId?: string; lat?: number; lng?: number; note?: string } }>(
    '/:id/stops',
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      if (!request.body?.name?.trim()) throw new BadRequestError('A stop name is required');
      const stop = await taskService.addStop(
        request.params.id,
        { userId: request.user.userId, role: request.user.role },
        request.body,
      );
      return reply.status(201).send({ ok: true, data: stop });
    }
  );

  /** GET /tasks/:id/stops - list stops in visit order. */
  app.get<{ Params: { id: string } }>(
    '/:id/stops',
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const stops = await taskService.listStops(request.params.id);
      return reply.send({ ok: true, data: stops });
    }
  );

  /** PATCH /tasks/:id/stops/:stopId/arrived - mark a stop reached. */
  app.patch<{ Params: { id: string; stopId: string } }>(
    '/:id/stops/:stopId/arrived',
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const stop = await taskService.markStopArrived(
        request.params.id,
        request.params.stopId,
        { userId: request.user.userId, role: request.user.role },
      );
      return reply.send({ ok: true, data: stop });
    }
  );

  /**
   * POST /tasks/:id/reassign
   * Handover / case termination with reassignment. Requires a reason. Optional
   * newVehicleId or autoAssign=true picks a replacement crew. Checks out the
   * original driver. Drivers may handover their own task; dispatchers any task.
   */
  app.post<{
    Params: { id: string };
    Body: { reason: string; newVehicleId?: string; autoAssign?: boolean };
  }>(
    '/:id/reassign',
    {
      preValidation: [
        requireRole([Role.DRIVER, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]),
      ],
    },
    async (request, reply) => {
      const result = await taskService.reassignTask(
        request.params.id,
        { userId: request.user.userId, role: request.user.role, agencyId: request.user.agencyId },
        request.body ?? { reason: '' },
      );
      return reply.send({ ok: true, data: result });
    }
  );

  /**
   * PATCH /tasks/:id/status
   * Update the status of a task (e.g. EN_ROUTE, AT_SCENE).
   */
  app.patch<{
    Params: { id: string };
    Body: {
      status: TaskStatus;
      reason?: string;
    };
  }>(
    '/:id/status',
    // Allowed for crew and dispatchers
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const updated = await taskService.updateTaskStatus(
        request.params.id,
        { userId: request.user.userId, role: request.user.role },
        request.body.status,
        request.body.reason
      );
      return reply.send({ ok: true, data: updated });
    }
  );

  /**
   * POST /tasks/:id/patient-care-report
   * Upload a patient care report (image) + optional note after task completion.
   *
   * Expects multipart/form-data:
   * - file: image/*, application/pdf, or .docx
   * - note: string (optional)
   */
  app.post<{ Params: { id: string } }>(
    '/:id/patient-care-report',
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const file = await (request as any).file?.();
      if (!file) throw new BadRequestError('file is required');
      if (!PCR_ALLOWED_MIMES.has(file.mimetype)) {
        throw new BadRequestError('file must be an image, PDF, or DOCX document');
      }

      const note = file.fields?.note?.value;

      const report = await taskService.uploadPatientCareReport(
        request.params.id,
        { userId: request.user.userId, role: request.user.role },
        { filename: file.filename, mimetype: file.mimetype, file: file.file },
        typeof note === 'string' ? note : undefined
      );

      return reply.status(201).send({ ok: true, data: report });
    }
  );

  /**
   * GET /tasks/:id/patient-care-reports
   * List previously uploaded patient care reports (metadata only).
   */
  app.get<{ Params: { id: string } }>(
    '/:id/patient-care-reports',
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const reports = await taskService.listPatientCareReports(request.params.id, {
        userId: request.user.userId,
        role: request.user.role,
      });
      return reply.send({ ok: true, data: reports });
    }
  );

  /**
   * GET /tasks/:taskId/patient-care-reports/:reportId/file
   * Streams the uploaded file (requires auth via Bearer header).
   */
  app.get<{ Params: { taskId: string; reportId: string } }>(
    '/:taskId/patient-care-reports/:reportId/file',
    async (request, reply) => {
      const reports = await taskService.listPatientCareReports(request.params.taskId, {
        userId: request.user.userId,
        role: request.user.role,
      });
      const report = reports.find((r) => r.id === request.params.reportId);
      if (!report) throw new BadRequestError('Report not found');

      const fileName = path.basename(report.filePath);
      const filePath = path.resolve(process.cwd(), 'uploads', 'pcr', fileName);
      if (!existsSync(filePath)) throw new BadRequestError('File not found on server');

      reply.header('Content-Type', report.mimeType || 'application/octet-stream');
      reply.header('Content-Disposition', `inline; filename="${fileName}"`);
      return reply.send(createReadStream(filePath));
    }
  );
};
