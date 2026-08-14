import { HostKind } from '@leviosa/shared';
import { LOCAL_HOST_ID, LOCAL_HOST_LABEL, Table } from '../config/index.config.js';

/**
 * Forward-only schema migrations, applied in ascending version order.
 *
 * The baseline in `schema.store.ts` still runs first on every boot and is idempotent,
 * so a fresh database is created at version 1 and then migrated forward exactly like
 * an existing one. That is deliberate: one code path means the migration sequence is
 * exercised on every clean install rather than only on the machines that already had
 * data, which is where an untested migration would otherwise detonate.
 *
 * No migration may be edited once released. Correct a mistake with a new version.
 */
export interface Migration {
  readonly version: number;
  readonly description: string;
  /** Executed in order inside a single transaction. */
  readonly statements: readonly string[];
}

/**
 * Version 2 introduces the host dimension.
 *
 * `host_id` is added with a `'local'` default so every pre-existing row is attributed
 * to the daemon that produced it. `volume_sighting` cannot take an `ALTER`, because its
 * primary key must widen from `volume_name` to `(host_id, volume_name)` and SQLite
 * cannot redefine a primary key in place — hence the copy-and-rename.
 *
 * There are intentionally no foreign keys onto `docker_host`. Adding one would force a
 * rebuild of `volume_measurement` too, and that table holds the growth history this
 * whole tool exists to produce; a table rebuild is the one operation that can lose it.
 * Cascading cleanup is done explicitly in `HostRepository.remove` instead, in a
 * transaction, which is equally safe and considerably easier to audit.
 */
const MIGRATION_V2_HOSTS: Migration = {
  version: 2,
  description: 'add docker_host registry and scope volume history by host_id',
  statements: [
    `CREATE TABLE IF NOT EXISTS ${Table.HOST} (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      kind TEXT NOT NULL,
      ssh_host TEXT,
      ssh_port INTEGER,
      ssh_user TEXT,
      ssh_key_path TEXT,
      host_key_fingerprint TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER
    )`,

    /* The local daemon must exist before history can reference it. Millis, to match
       every other timestamp in the schema. */
    `INSERT INTO ${Table.HOST} (id, label, kind, enabled, created_at)
     VALUES ('${LOCAL_HOST_ID}', '${LOCAL_HOST_LABEL}', '${HostKind.LOCAL}', 1,
             CAST(strftime('%s', 'now') AS INTEGER) * 1000)
     ON CONFLICT (id) DO NOTHING`,

    `ALTER TABLE ${Table.MEASUREMENT} ADD COLUMN host_id TEXT NOT NULL DEFAULT '${LOCAL_HOST_ID}'`,
    `ALTER TABLE ${Table.AUDIT} ADD COLUMN host_id TEXT NOT NULL DEFAULT '${LOCAL_HOST_ID}'`,

    /* The old index leads with volume_name, so it cannot serve a host-scoped lookup. */
    `DROP INDEX IF EXISTS idx_measurement_volume_time`,
    `CREATE INDEX IF NOT EXISTS idx_measurement_host_volume_time
      ON ${Table.MEASUREMENT} (host_id, volume_name, captured_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_host_created
      ON ${Table.AUDIT} (host_id, created_at DESC)`,

    /* Primary key widening by copy. Column list is explicit on both sides so a future
       column added to the baseline cannot silently shift the positional mapping. */
    `CREATE TABLE ${Table.SIGHTING}_migrating (
      host_id TEXT NOT NULL,
      volume_name TEXT NOT NULL,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      last_seen_attached_at INTEGER,
      last_consumers TEXT,
      PRIMARY KEY (host_id, volume_name)
    )`,
    `INSERT INTO ${Table.SIGHTING}_migrating
      (host_id, volume_name, first_seen_at, last_seen_at, last_seen_attached_at, last_consumers)
     SELECT '${LOCAL_HOST_ID}', volume_name, first_seen_at, last_seen_at, last_seen_attached_at, last_consumers
     FROM ${Table.SIGHTING}`,
    `DROP TABLE ${Table.SIGHTING}`,
    `ALTER TABLE ${Table.SIGHTING}_migrating RENAME TO ${Table.SIGHTING}`,
  ],
};

const MIGRATIONS: readonly Migration[] = Object.freeze([MIGRATION_V2_HOSTS]);

export const MigrationStore = Object.freeze({
  all(): readonly Migration[] {
    return MIGRATIONS;
  },

  /** Migrations newer than the version already recorded, in ascending order. */
  pending(appliedVersion: number): readonly Migration[] {
    return [...MIGRATIONS]
      .filter((migration) => migration.version > appliedVersion)
      .sort((left, right) => left.version - right.version);
  },

  /** Highest version this build knows how to produce. */
  latestVersion(): number {
    return MIGRATIONS.reduce((highest, migration) => Math.max(highest, migration.version), 1);
  },
});
