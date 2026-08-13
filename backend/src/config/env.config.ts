import { resolve } from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import { MillisIn } from '@leviosa/shared';
import { NodeEnv } from './constants.config.js';

/**
 * The one and only place `process.env` is read. Everything downstream imports the
 * frozen `Config` object, so no module can smuggle in an undeclared variable and
 * no value can be mutated at runtime.
 */

/**
 * Environment variables are always strings; these adapters carry them into real types.
 * Defaults are declared as the parsed (output) value, not as the raw string, so the
 * fallback cannot drift from what the parser would have produced.
 */
const booleanFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const csvFromEnv = z.string().transform((value) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0),
);

/**
 * Both spellings of loopback are allowed by default.
 *
 * `localhost` and `127.0.0.1` are distinct origins to a browser, and the frontend ships
 * with `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4300`. Allowing only one of them means
 * whichever spelling the developer types into the address bar decides whether the
 * dashboard works, and the failure surfaces as an opaque network error rather than
 * anything mentioning CORS. They are the same machine; there is no boundary here to
 * defend by being strict.
 */
const DEFAULT_CORS_ORIGINS: string[] = ['http://localhost:4200', 'http://127.0.0.1:4200'];

const envSchema = z.object({
  NODE_ENV: z.enum([NodeEnv.DEVELOPMENT, NodeEnv.PRODUCTION, NodeEnv.TEST]).default(NodeEnv.DEVELOPMENT),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4300),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: csvFromEnv.default(DEFAULT_CORS_ORIGINS),
  /** Body limit is tiny by design: this API accepts no uploads. */
  BODY_LIMIT: z.string().default('64kb'),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().min(0).default(10 * MillisIn.SECOND),

  /** Unix socket path to the Engine API. Ignored when DOCKER_HOST is a TCP URL. */
  DOCKER_SOCKET_PATH: z.string().min(1).default('/var/run/docker.sock'),
  DOCKER_HOST: z.string().optional(),
  DOCKER_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30 * MillisIn.SECOND),
  /** How long a listing of volumes/containers may be reused before re-polling. */
  INVENTORY_CACHE_MS: z.coerce.number().int().min(0).default(3 * MillisIn.SECOND),

  /** Image used for sidecar measurement. Must contain a POSIX shell, du, find, stat. */
  SCANNER_IMAGE: z.string().min(1).default('alpine:3.22'),
  /** Pull the scanner image on demand when it is missing locally. */
  SCANNER_AUTO_PULL: booleanFromEnv.default(true),
  SCAN_TIMEOUT_MS: z.coerce.number().int().min(5 * MillisIn.SECOND).default(5 * MillisIn.MINUTE),
  /** Simultaneous sidecars. Scans are IO-bound on the daemon, so keep this low. */
  SCAN_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  /** Queue depth before new scan requests are rejected outright. */
  SCAN_QUEUE_LIMIT: z.coerce.number().int().min(1).default(200),
  /** A measurement older than this is reported as STALE. */
  SCAN_CACHE_TTL_MS: z.coerce.number().int().min(MillisIn.MINUTE).default(6 * MillisIn.HOUR),
  /** Second traversal that finds the newest mtime. Doubles scan cost when enabled. */
  SCAN_WITH_LAST_WRITE: booleanFromEnv.default(true),
  /** Allow reading the volume mountpoint directly when this process actually can. */
  SCAN_ALLOW_HOST_FS: booleanFromEnv.default(true),
  /** Cap on entries returned per directory listing. */
  BROWSE_MAX_ENTRIES: z.coerce.number().int().min(10).max(5_000).default(500),

  /** SQLite file holding measurements, sightings and the audit trail. */
  DATABASE_PATH: z.string().min(1).default('./data/leviosa.sqlite'),
  HISTORY_RETENTION_DAYS: z.coerce.number().int().min(1).max(3_650).default(90),

  /** Background re-measurement that feeds the growth series. */
  SNAPSHOT_ENABLED: booleanFromEnv.default(true),
  /** Cron expression, daemon-local time. Default: 03:15 every day. */
  SNAPSHOT_CRON: z.string().min(1).default('15 3 * * *'),
  /** How often the sighting ledger records who is attached to what. */
  SIGHTING_INTERVAL_MS: z.coerce.number().int().min(MillisIn.SECOND).default(5 * MillisIn.MINUTE),
  /** Idle-day figures stay flagged unreliable until the ledger is at least this old. */
  SIGHTING_TRUST_AFTER_DAYS: z.coerce.number().int().min(1).default(7),

  /** Destructive endpoints are opt-in: read-only by default. */
  ALLOW_VOLUME_DELETE: booleanFromEnv.default(true),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Fail loudly at boot rather than serving a half-configured process.
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const env = parsed.data;

export const Config = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === NodeEnv.PRODUCTION,
  isDevelopment: env.NODE_ENV === NodeEnv.DEVELOPMENT,

  http: Object.freeze({
    host: env.HOST,
    port: env.PORT,
    corsOrigins: Object.freeze(env.CORS_ORIGINS),
    bodyLimit: env.BODY_LIMIT,
    shutdownGraceMs: env.SHUTDOWN_GRACE_MS,
  }),

  log: Object.freeze({
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV !== NodeEnv.PRODUCTION,
  }),

  docker: Object.freeze({
    socketPath: env.DOCKER_SOCKET_PATH,
    host: env.DOCKER_HOST ?? null,
    timeoutMs: env.DOCKER_TIMEOUT_MS,
    inventoryCacheMs: env.INVENTORY_CACHE_MS,
  }),

  scan: Object.freeze({
    image: env.SCANNER_IMAGE,
    autoPull: env.SCANNER_AUTO_PULL,
    timeoutMs: env.SCAN_TIMEOUT_MS,
    concurrency: env.SCAN_CONCURRENCY,
    queueLimit: env.SCAN_QUEUE_LIMIT,
    cacheTtlMs: env.SCAN_CACHE_TTL_MS,
    withLastWrite: env.SCAN_WITH_LAST_WRITE,
    allowHostFs: env.SCAN_ALLOW_HOST_FS,
    browseMaxEntries: env.BROWSE_MAX_ENTRIES,
  }),

  database: Object.freeze({
    path: resolve(process.cwd(), env.DATABASE_PATH),
    retentionDays: env.HISTORY_RETENTION_DAYS,
  }),

  scheduler: Object.freeze({
    snapshotEnabled: env.SNAPSHOT_ENABLED,
    snapshotCron: env.SNAPSHOT_CRON,
    sightingIntervalMs: env.SIGHTING_INTERVAL_MS,
    sightingTrustAfterDays: env.SIGHTING_TRUST_AFTER_DAYS,
  }),

  features: Object.freeze({
    allowVolumeDelete: env.ALLOW_VOLUME_DELETE,
  }),
});

export type AppConfig = typeof Config;
