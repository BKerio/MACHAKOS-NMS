import { FastifyInstance } from 'fastify';
import { Role } from '../../shared/types/index.js';

export interface PresenceUser {
  userId: string;
  name: string;
  role: Role;
  agencyId: string | null;
  agencyName: string | null;
  /** ISO timestamp of the user's earliest still-open connection (i.e. "on duty since"). */
  connectedAt: string;
  /** Number of open sockets/tabs for this user (usually 1). */
  sockets: number;
}

interface PresenceEntry {
  userId: string;
  name: string;
  role: Role;
  agencyId: string | null;
  agencyName: string | null;
  connectedAt: string;
  socketIds: Set<string>;
}

/**
 * In-process "who is online right now" tracker, keyed by user id.
 *
 * There is no separate shift/duty flag for desk roles (Watcher, Dispatcher) -
 * being connected on an authenticated Socket.io session *is* being on duty for
 * the purposes of the call-centre wallboard. Sockets are added/removed from
 * plugins/socketio.ts as users connect and disconnect.
 *
 * NOTE: this lives in memory on a single Fastify process, which matches how
 * this API is deployed today. If it's ever scaled to multiple instances behind
 * a load balancer, back this with Redis instead (a hash per role, refcounted
 * per socket) - the same pattern already used for GPS caching in fleet.service.ts.
 */
export class PresenceService {
  private online = new Map<string, PresenceEntry>();

  constructor(private app: FastifyInstance) {}

  addSocket(
    socketId: string,
    user: { userId: string; name: string; role: Role; agencyId: string | null; agencyName: string | null },
  ) {
    const existing = this.online.get(user.userId);
    if (existing) {
      existing.socketIds.add(socketId);
      return;
    }
    this.online.set(user.userId, {
      ...user,
      connectedAt: new Date().toISOString(),
      socketIds: new Set([socketId]),
    });
  }

  /** Drops a single socket; the user falls off the board once their last tab/session closes. */
  removeSocket(socketId: string, userId: string) {
    const entry = this.online.get(userId);
    if (!entry) return;
    entry.socketIds.delete(socketId);
    if (entry.socketIds.size === 0) this.online.delete(userId);
  }

  /** Snapshot of everyone currently online, optionally filtered to a set of roles. */
  list(roles?: Role[]): PresenceUser[] {
    return Array.from(this.online.values())
      .filter((e) => !roles || roles.includes(e.role))
      .map((e) => ({
        userId: e.userId,
        name: e.name,
        role: e.role,
        agencyId: e.agencyId,
        agencyName: e.agencyName,
        connectedAt: e.connectedAt,
        sockets: e.socketIds.size,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    presence: PresenceService;
  }
}
