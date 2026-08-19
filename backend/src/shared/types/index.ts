/**
 * Shared TypeScript types and interfaces used across the entire backend.
 * Import from here to avoid circular dependencies between modules.
 */

// ── Prisma Enums ──────────────────────────────────────────────────────────────
import { Role, IncidentStatus, TaskStatus, AgencyType, VehicleStatus } from '../../generated/prisma/index.js';
export { Role, IncidentStatus, TaskStatus, AgencyType, VehicleStatus };

// ── JWT ───────────────────────────────────────────────────────────────────────
// Shape of the payload encoded inside every JWT token
export interface JwtPayload {
  userId: string;
  role: Role;
  agencyId: string;
  // Set only on the short-lived token issued when login finds more than one
  // role on the account. A pending token can call POST /auth/select-role and
  // nothing else - app.authenticate rejects it everywhere. Cleared on the
  // full token select-role issues once the user picks an active role.
  pending?: boolean;
}

// ── Pagination ────────────────────────────────────────────────────────────────
export interface PaginationQuery {
  page?: number;   // 1-indexed, default: 1
  limit?: number;  // default: 20, max: 100
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── Standard API Envelope ─────────────────────────────────────────────────────
// Every API response will follow this shape for consistency
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
}

// ── Coordinates ───────────────────────────────────────────────────────────────
export interface Coordinates {
  lat: number;
  lng: number;
}
