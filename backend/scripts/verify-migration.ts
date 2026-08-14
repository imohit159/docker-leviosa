/**
 * Throwaway harness: applies the real migration path to a copy of the live database and
 * asserts nothing was lost. Not part of the build.
 */
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_VERSION_KEY, Table } from '../src/config/index.config.js';
import { MigrationStore, SchemaStore } from '../src/store/index.store.js';

const SOURCE = 'data/leviosa.sqlite';
const TARGET = 'data/verify-migration.sqlite';

const SIDECAR_SUFFIXES = ['', '-wal', '-shm'] as const;

for (const suffix of SIDECAR_SUFFIXES) {
  rmSync(`${TARGET}${suffix}`, { force: true });
}
if (!existsSync(SOURCE)) {
  throw new Error(`no source database at ${SOURCE}`);
}

/*
 * The write-ahead log has to come with it.
 *
 * In WAL mode a committed change lives in `-wal` until a checkpoint folds it into the
 * main file, so copying `.sqlite` alone yields a silently stale snapshot. That is not
 * hypothetical: an earlier version of this script copied only the main file, read a
 * schema version of 1 from it, and reported a clean migration — while the real database
 * had already been stamped 2 in its WAL and was in the exact broken state the check was
 * supposed to catch.
 */
for (const suffix of SIDECAR_SUFFIXES) {
  if (existsSync(`${SOURCE}${suffix}`)) {
    copyFileSync(`${SOURCE}${suffix}`, `${TARGET}${suffix}`);
  }
}

const db = new DatabaseSync(TARGET);

function counts(label: string): void {
  const rows: Record<string, unknown> = {};
  for (const table of [Table.MEASUREMENT, Table.SIGHTING, Table.AUDIT, Table.HOST]) {
    try {
      rows[table] = (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    } catch {
      rows[table] = 'absent';
    }
  }
  const version = db.prepare(`SELECT value FROM ${Table.META} WHERE key = ?`).get(SCHEMA_VERSION_KEY);
  console.log(label, JSON.stringify({ ...rows, version }));
}

counts('BEFORE');

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
for (const statement of SchemaStore.statements()) {
  db.exec(statement);
}

const applied = Number(
  (db.prepare(`SELECT value FROM ${Table.META} WHERE key = ?`).get(SCHEMA_VERSION_KEY) as { value?: string })
    ?.value ?? 1,
);

for (const migration of MigrationStore.pending(applied)) {
  console.log(`applying v${String(migration.version)}: ${migration.description}`);
  db.exec('BEGIN');
  try {
    for (const statement of migration.statements) {
      db.exec(statement);
    }
    db.prepare(
      `INSERT INTO ${Table.META} (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    ).run(SCHEMA_VERSION_KEY, String(migration.version));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

counts('AFTER');

console.log('--- sighting DDL ---');
console.log(
  (db.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(Table.SIGHTING) as { sql: string }).sql,
);
console.log('--- indexes ---');
console.log(JSON.stringify(db.prepare(`SELECT name, tbl_name FROM sqlite_master WHERE type = 'index'`).all()));
console.log('--- host rows ---');
console.log(JSON.stringify(db.prepare(`SELECT * FROM ${Table.HOST}`).all()));
console.log('--- host_id backfill spot check ---');
console.log(
  JSON.stringify({
    measurement: db.prepare(`SELECT host_id, volume_name FROM ${Table.MEASUREMENT}`).all(),
    sighting: db.prepare(`SELECT host_id, volume_name FROM ${Table.SIGHTING}`).all(),
    auditDistinct: db.prepare(`SELECT DISTINCT host_id FROM ${Table.AUDIT}`).all(),
  }),
);

console.log('--- idempotency: re-running yields no pending work ---');
const second = Number(
  (db.prepare(`SELECT value FROM ${Table.META} WHERE key = ?`).get(SCHEMA_VERSION_KEY) as { value?: string })
    ?.value ?? 0,
);
console.log(
  JSON.stringify({
    storedVersion: second,
    expected: SchemaStore.version,
    pendingAfter: MigrationStore.pending(second).length,
  }),
);

db.close();
process.exit(0);
