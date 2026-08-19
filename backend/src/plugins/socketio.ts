import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import { JwtPayload, Role } from '../shared/types/index.js';
import { PresenceService } from '../modules/presence/presence.service.js';

// Roles that see the call-centre wallboard / admin consoles - presence
// snapshots are pushed to these rooms whenever someone connects or disconnects.
const PRESENCE_WATCHER_ROLES = [Role.WATCHER, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN];

const socketPlugin = fp(async (app: FastifyInstance) => {
  const io = new Server(app.server, {
    cors: {
      origin: app.config.CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
  });

  app.decorate('io', io);
  app.decorate('presence', new PresenceService(app));

  const broadcastPresence = () => {
    const snapshot = app.presence.list();
    let target = io.to(`role:${PRESENCE_WATCHER_ROLES[0]}`);
    for (const role of PRESENCE_WATCHER_ROLES.slice(1)) target = target.to(`role:${role}`);
    target.emit('presence:update', snapshot);
  };

  // Verify JWT on every socket connection - runs before 'connection' fires
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication token required'));
    }
    try {
      const payload = await app.jwt.verify<JwtPayload>(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role, agencyId } = socket.data.user as JwtPayload;

    // Auto-join rooms from the verified token - client cannot spoof these
    socket.join(`user:${userId}`);
    socket.join(`role:${role}`);
    app.log.info(`🔌 Socket connected: ${socket.id} → user:${userId} role:${role}`);

    // join:room kept for client compatibility but rooms are already joined above
    socket.on('join:room', () => { /* no-op: rooms joined from verified token */ });

    // Register presence for the call-centre wallboard ("who is on duty right now").
    // Fetching name/agency here (once per connection) keeps the JWT payload lean.
    app.prisma.user
      .findUnique({ where: { id: userId }, select: { name: true, agency: { select: { name: true } } } })
      .then((u) => {
        app.presence.addSocket(socket.id, {
          userId,
          name: u?.name ?? 'Unknown',
          role,
          agencyId: agencyId ?? null,
          agencyName: u?.agency?.name ?? null,
        });
        broadcastPresence();
      })
      .catch((err) => app.log.warn({ err, userId }, 'Failed to register presence'));

    socket.on('disconnect', () => {
      app.log.info(`🔌 Socket disconnected: ${socket.id} (user:${userId})`);
      app.presence.removeSocket(socket.id, userId);
      broadcastPresence();
    });
  });

  app.addHook('onClose', (app, done) => {
    app.io.close();
    done();
  });
});

export default socketPlugin;

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}
