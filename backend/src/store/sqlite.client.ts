import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import { Config, Table } from '../config/index.config.js';
import { Logger } from '../utils/index.utils.js';
import { SchemaStore } from './schema.store.js';

const log = Logger.for('sqlite');

const VERSION_KEY = 'schema_version';

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

function _applySchema(db: DatabaseSync): void {
  for (const pragma of PRAGMAS) {
    db.exec(pragma);
  }
  for (const statement of SchemaStore.statements()) {
    db.exec(statement);
  }
  db.prepare(`INSERT INTO ${Table.META} (key, value) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(VERSION_KEY, String(SchemaStore.version));
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

    log.info({ path: Config.database.path, schemaVersion: SchemaStore.version }, 'sqlite ready');
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
