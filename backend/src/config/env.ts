import { FastifyInstance } from 'fastify';
import fastifyEnv from '@fastify/env';

/**
 * JSON Schema defining all required and optional environment variables.
 * The app will refuse to start if any required variable is missing.
 */
const schema = {
  type: 'object',
  required: ['PORT', 'DATABASE_URL', 'JWT_SECRET'],
  properties: {
    PORT: {
      type: 'string',
      default: '3000',
    },
    HOST: {
      type: 'string',
      default: '0.0.0.0',
    },
    NODE_ENV: {
      type: 'string',
      enum: ['development', 'production', 'test'],
      default: 'development',
    },
    LOG_LEVEL: {
      type: 'string',
      default: 'info',
    },
    CORS_ORIGIN: {
      type: 'string',
      default: '*',
    },
    DATABASE_URL: {
      type: 'string',
    },
    JWT_SECRET: {
      type: 'string',
      minLength: 16,
    },
    JWT_EXPIRES_IN: {
      type: 'string',
      default: '7d',
    },
    // Shared secret for the read-only call-centre wallboard display, so a TV in
    // the ops room can render it without anyone logging in. Leave EMPTY to keep
    // the public display disabled entirely (the default).
    WALLBOARD_TOKEN: {
      type: 'string',
      default: '',
    },
    REDIS_URL: {
      type: 'string',
      default: 'redis://localhost:6379',
    },
    UFFIZIO_BASE_URL: {
      type: 'string',
      default: 'http://13.245.46.90',
    },
    UFFIZIO_USERNAME: {
      type: 'string',
      default: '',
    },
    UFFIZIO_PASSWORD: {
      type: 'string',
      default: '',
    },
    UFFIZIO_PROJECT_ID: {
      type: 'string',
      default: '49',
    },
    UFFIZIO_COMPANY: {
      type: 'string',
      default: 'Nairobi Emergency Operation Center',
    },
    YEASTAR_BASE_URL: {
      type: 'string',
      default: '',
    },
    YEASTAR_CLIENT_ID: {
      type: 'string',
      default: '',
    },
    YEASTAR_CLIENT_SECRET: {
      type: 'string',
      default: '',
    },
    YEASTAR_WEBHOOK_SECRET: {
      type: 'string',
      default: '',
    },
    // Advanta SMS credentials (ADVANTA_SMS_URL, ADVANTA_API_KEY, ADVANTA_PARTNER_ID,
    // ADVANTA_SHORTCODE) are read directly from process.env by src/services/sms.ts,
    // not through this schema - see that file for the exact var names.
    // Same key as frontend / mobile - used to reverse-geocode check-in GPS → place names
    GOOGLE_MAPS_KEY: {
      type: 'string',
      default: '',
    },
  },
};

/**
 * TypeScript declaration merging - makes all validated env vars available
 * as fully-typed properties on process.env throughout the entire codebase.
 */
declare module 'fastify' {
  interface FastifyInstance {
    config: {
      PORT: string;
      HOST: string;
      NODE_ENV: 'development' | 'production' | 'test';
      LOG_LEVEL: string;
      CORS_ORIGIN: string;
      DATABASE_URL: string;
      JWT_SECRET: string;
      JWT_EXPIRES_IN: string;
      WALLBOARD_TOKEN: string;
      REDIS_URL: string;
      UFFIZIO_BASE_URL: string;
      UFFIZIO_USERNAME: string;
      UFFIZIO_PASSWORD: string;
      UFFIZIO_PROJECT_ID: string;
      UFFIZIO_COMPANY: string;
      YEASTAR_BASE_URL: string;
      YEASTAR_CLIENT_ID: string;
      YEASTAR_CLIENT_SECRET: string;
      YEASTAR_WEBHOOK_SECRET: string;
      GOOGLE_MAPS_KEY: string;
    };
  }
}

/**
 * Registers the env plugin on the Fastify instance.
 * After registration, all variables are accessible via `app.config`.
 */
export async function registerEnv(app: FastifyInstance): Promise<void> {
  await app.register(fastifyEnv, {
    schema,
    dotenv: true, // loads .env file automatically
    confKey: 'config', // access via app.config.JWT_SECRET etc.
  });
}
