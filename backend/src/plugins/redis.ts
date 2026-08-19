import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import Redis from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis | null;
  }
}

const redisPlugin = fp(async (app: FastifyInstance) => {
  const client = new Redis(app.config.REDIS_URL, {
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  try {
    await client.connect();
    app.log.info('✅ Redis connected');
    app.decorate('redis', client);
    app.addHook('onClose', async () => { client.disconnect(); });
  } catch (err) {
    app.log.warn('⚠️  Redis unavailable - GPS caching disabled');
    client.disconnect();
    app.decorate('redis', null);
  }
});

export default redisPlugin;
