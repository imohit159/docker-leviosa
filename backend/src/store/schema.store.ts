import { Table } from '../config/index.config.js';
import { MigrationStore } from './migration.store.js';

/**
 * The version 1 baseline, applied idempotently at boot.
 *
 * This is frozen history and must not be edited. Anything that changes the shape of an
 * existing table belongs in `migration.store.ts`, because a `CREATE TABLE IF NOT
 * EXISTS` is a no-op against a file that already has the table — editing a column here
 * would alter fresh installs and silently skip every database that already has data.
 *
 * `SchemaStore.version` is the version the file should end up at after migrations run,
 * not the version this DDL produces. It is derived from the migration list rather than
 * hand-maintained, so adding a migration cannot leave a constant behind.
 *
 * Conventions: every timestamp is epoch millis stored as INTEGER, every boolean is
 * 0/1, and structured payloads are JSON text. There is no ORM by design — the query
 * surface is a handful of statements and an ORM would add more concepts than it removes.
 */
export const SchemaStore = Object.freeze({
  version: MigrationStore.latestVersion(),

  statements(): readonly string[] {
    return Object.freeze([
      `CREATE TABLE IF NOT EXISTS ${Table.META} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,

      /* One row per completed measurement. History is the point: the growth series
         is derived from it, so rows are retained rather than overwritten. */
      `CREATE TABLE IF NOT EXISTS ${Table.MEASUREMENT} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        volume_name TEXT NOT NULL,
        total_bytes INTEGER NOT NULL,
        file_count INTEGER NOT NULL,
        directory_count INTEGER NOT NULL,
        last_write_at INTEGER,
        source TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        truncated INTEGER NOT NULL DEFAULT 0,
        top_entries TEXT NOT NULL DEFAULT '[]',
        captured_at INTEGER NOT NULL
      )`,

      `CREATE INDEX IF NOT EXISTS idx_measurement_volume_time
        ON ${Table.MEASUREMENT} (volume_name, captured_at DESC)`,

      /* The sighting ledger. Docker cannot tell us when a volume was last attached to
         a container, so we record what we observe ourselves. */
      `CREATE TABLE IF NOT EXISTS ${Table.SIGHTING} (
        volume_name TEXT PRIMARY KEY,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        last_seen_attached_at INTEGER,
        last_consumers TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS ${Table.AUDIT} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        volume_name TEXT,
        payload TEXT,
        created_at INTEGER NOT NULL
      )`,

      `CREATE INDEX IF NOT EXISTS idx_audit_created ON ${Table.AUDIT} (created_at DESC)`,
    ]);
  },
});
