import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import { Config, SCHEMA_VERSION_KEY, Table } from '../config/index.config.js';
import { Logger } from '../utils/index.utils.js';
import { MigrationStore } from './migration.store.js';
import { SchemaStore } from './schema.store.js';

const log = Logger.for('sqlite');

/** Value types SQLite can bind. Booleans are stored as 0/1 by the callers. */
export type SqliteParam = string | number | bigint | null | Uint8Array;

let database: DatabaseSync | null = null;
/** Statements are compiled once and reused; recompiling per call is pure waste. */
const statementCache = new Map<string, StatementSync>();

/**
 * Pragmas set on every connection.
 *  - WAL keeps the periodic snapshot writer from blocking API reads.
 *  - NORMAL synchronous is the right trade for a local analytics cache: a machine
 *    crash may cost the newest snapshot, which the next scan regenerates.
 */
const PRAGMAS: readonly string[] = Object.freeze([
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA foreign_keys = ON',
  'PRAGMA busy_timeout = 5000',
]);

function _stampVersion(db: DatabaseSync, version: number): void {
  db.prepare(`INSERT INTO ${Table.META} (key, value) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(SCHEMA_VERSION_KEY, String(version));
}

/**
 * The version already present in the file, or `null` when the file is new.
 *
 * Read *before* anything stamps a version. Stamping unconditionally at boot — which is
 * what this module used to do — would mark an unmigrated database as current and cause
 * every later migration to be skipped forever.
 */
function _readVersion(db: DatabaseSync): number | null {
  const row = db.prepare(`SELECT value FROM ${Table.META} WHERE key = ?`).get(SCHEMA_VERSION_KEY) as
    | { value?: string }
    | undefined;

  const parsed = Number(row?.value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Brings the file up to the newest migration.
 *
 * The baseline DDL runs first and is idempotent, so a brand-new file lands at version 1
 * and then walks the same migration path as a file that already holds data.
 *
 * The one rule here: the recorded version is only ever advanced immediately after a
 * migration has actually run, inside that migration's own transaction. It is never set
 * from a constant. Stamping a target version because "there is nothing pending" is what
 * silently branded a version 1 file as version 2 during development, after which every
 * migration was skipped forever and the tables simply never appeared.
 */
function _applySchema(db: DatabaseSync): void {
  for (const pragma of PRAGMAS) {
    db.exec(pragma);
  }
  for (const statement of SchemaStore.statements()) {
    db.exec(statement);
  }

  // A file with the baseline tables but no recorded version is, by definition, at 1.
  const BASELINE_VERSION = 1;
  const recorded = _readVersion(db);
  const applied = recorded ?? BASELINE_VERSION;

  if (recorded === null) {
    // Honest: the DDL that just ran is exactly the version 1 shape.
    _stampVersion(db, BASELINE_VERSION);
  }

  const pending = MigrationStore.pending(applied);
  if (pending.length === 0) {
    return;
  }

  for (const migration of pending) {
    log.info(
      { from: applied, to: migration.version, description: migration.description },
      'applying schema migration',
    );

    // Each migration commits on its own so a failure at version 4 cannot roll back a
    // healthy version 3, leaving the file at a version that was genuinely reached.
    db.exec('BEGIN');
    try {
      for (const statement of migration.statements) {
        db.exec(statement);
      }
      _stampVersion(db, migration.version);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      log.error({ err: error, version: migration.version }, 'schema migration failed; database left untouched');
      throw error;
    }

    log.info({ version: migration.version }, 'schema migration applied');
  }
}

/**
 * Owns the embedded database. SQLite via `node:sqlite` is deliberate: this is a
 * single-node developer tool whose state is a cache plus a local time series, so a
 * server process to administer would be pure operational overhead. Every call here
 * is synchronous, which is acceptable only because each statement touches at most a
 * few hundred rows — anything heavier belongs in the scan queue, not in a request.
 */
export const SqliteClient = Object.freeze({
  connect(): DatabaseSync {
    if (database) {
      return database;
    }

    mkdirSync(dirname(Config.database.path), { recursive: true });
    const db = new DatabaseSync(Config.database.path);
    _applySchema(db);
    database = db;

    // Reported from the file, not from a constant, so the log cannot claim a version
    // the database does not actually have.
    log.info({ path: Config.database.path, schemaVersion: _readVersion(db) }, 'sqlite ready');
    return db;
  },

  /** Compiled-statement accessor. Callers pass positional `?` parameters only. */
  statement(sql: string): StatementSync {
    const cached = statementCache.get(sql);
    if (cached) {
      return cached;
    }
    const prepared = SqliteClient.connect().prepare(sql);
    statementCache.set(sql, prepared);
    return prepared;
  },

  /**
   * Typed row accessors. `node:sqlite` returns untyped records, so the assertion from
   * column shape to row interface happens here once instead of in every repository.
   * The repositories' row interfaces are therefore the single description of each
   * table's read shape.
   */
  select<TRow>(sql: string, ...params: SqliteParam[]): TRow[] {
    return SqliteClient.statement(sql).all(...params) as unknown as TRow[];
  },

  selectOne<TRow>(sql: string, ...params: SqliteParam[]): TRow | undefined {
    return SqliteClient.statement(sql).get(...params) as unknown as TRow | undefined;
  },

  /** Returns the number of affected rows. */
  execute(sql: string, ...params: SqliteParam[]): number {
    return Number(SqliteClient.statement(sql).run(...params).changes);
  },

  /** Wraps a unit of work in a transaction so partial writes cannot survive a throw. */
  transaction<TResult>(work: () => TResult): TResult {
    const db = SqliteClient.connect();
    db.exec('BEGIN');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },

  close(): void {
    statementCache.clear();
    database?.close();
    database = null;
  },
});
