import { FastifyReply, FastifyRequest } from 'fastify';
import { Role } from '../types/index.js';
import { ForbiddenError } from '../errors/AppError.js';

/**
 * Middleware factory to enforce Role-Based Access Control (RBAC).
 * Assumes the request has already passed `app.authenticate` and `request.user` is populated.
 *
 * Usage:
 *   app.post('/some-route', {
 *     preValidation: [app.authenticate, requireRole(['SUPER_ADMIN', 'ADMIN'])]
 *   }, handler)
 *
 * @param allowedRoles Array of roles that are allowed to access the route
 */
export function requireRole(allowedRoles: Role[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = request.user;

    if (!user) {
      throw new ForbiddenError('Access denied: User context missing');
    }

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenError(`Access denied: Requires one of [${allowedRoles.join(', ')}]`);
    }
  };
}
