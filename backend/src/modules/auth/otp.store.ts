import { FastifyInstance } from 'fastify';

/**
 * Tiny key/value store for login codes, backed by Redis when it is up and by
 * process memory when it is not.
 *
 * Redis is optional everywhere else in this app (it only caches GPS), so a box
 * without it used to make field-crew login impossible: every "send code"
 * request failed before the SMS was even attempted. Codes are short-lived and
 * single-use, so falling back to memory is an acceptable trade for keeping crews
 * able to sign in.
 *
 * Caveat: the in-memory map is per-process, so across a multi-instance
 * deployment a code issued by one instance cannot be verified by another.
 * Run Redis in production to get a shared store.
 */
export interface OtpStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Overwrites the value while leaving the original expiry untouched. */
  setKeepingTtl(key: string, value: string): Promise<void>;
  del(...keys: string[]): Promise<void>;
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

const memory = new Map<string, MemoryEntry>();

function readMemory(key: string): MemoryEntry | null {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry;
}

const memoryStore: OtpStore = {
  async get(key) {
    return readMemory(key)?.value ?? null;
  },
  async set(key, value, ttlSeconds) {
    memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  },
  async setKeepingTtl(key, value) {
    const existing = readMemory(key);
    if (!existing) return; // Matches Redis KEEPTTL on a vanished key: no-op.
    memory.set(key, { value, expiresAt: existing.expiresAt });
  },
  async del(...keys) {
    for (const key of keys) memory.delete(key);
  },
};

function redisStore(redis: NonNullable<FastifyInstance['redis']>): OtpStore {
  return {
    get: (key) => redis.get(key),
    set: async (key, value, ttlSeconds) => {
      await redis.set(key, value, 'EX', ttlSeconds);
    },
    setKeepingTtl: async (key, value) => {
      await redis.set(key, value, 'KEEPTTL');
    },
    del: async (...keys) => {
      await redis.del(...keys);
    },
  };
}

export function getOtpStore(app: FastifyInstance): OtpStore {
  if (app.redis) return redisStore(app.redis);

  app.log.warn('Redis unavailable - login codes are being held in process memory');
  return memoryStore;
}
