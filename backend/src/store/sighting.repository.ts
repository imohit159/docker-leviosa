import { Table } from '../config/index.config.js';
import { Clock } from '../utils/index.utils.js';
import { SqliteClient } from './sqlite.client.js';

export interface StoredSighting {
  volumeName: string;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
  /** Last moment we observed at least one container referencing this volume. */
  lastSeenAttachedAtMs: number | null;
  /** Names of the containers seen at that moment, for context in the UI. */
  lastConsumers: string[];
}

/** One observation of a volume's attachment state at a point in time. */
export interface SightingObservation {
  volumeName: string;
  consumerNames: string[];
}

interface SightingRow {
  volume_name: string;
  first_seen_at: number;
  last_seen_at: number;
  last_seen_attached_at: number | null;
  last_consumers: string | null;
}

const SELECT_COLUMNS = 'volume_name, first_seen_at, last_seen_at, last_seen_attached_at, last_consumers';

function _parseConsumers(json: string | null): string[] {
  if (!json) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function _toStored(row: SightingRow): StoredSighting {
  return {
    volumeName: row.volume_name,
    firstSeenAtMs: row.first_seen_at,
    lastSeenAtMs: row.last_seen_at,
    lastSeenAttachedAtMs: row.last_seen_attached_at,
    lastConsumers: _parseConsumers(row.last_consumers),
  };
}

/**
 * The attachment ledger.
 *
 * This exists because the Docker Engine stores no "last used" timestamp for a volume:
 * `volume inspect` reports creation time and nothing else, and once the last
 * referencing container is removed, that relationship is gone from the daemon
 * entirely. The only honest way to answer "how long has this been idle?" is to observe
 * it ourselves over time, which is what this table records. Consequently the answer is
 * never older than this tool's installation, and callers are told as much through
 * `trackingReliable`.
 */
export const SightingRepository = Object.freeze({
  /**
   * Records one polling round for every volume currently on the daemon. Written in a
   * single transaction so a crash mid-sweep cannot leave a half-updated ledger.
   */
  observe(observations: readonly SightingObservation[]): void {
    if (observations.length === 0) {
      return;
    }

    const now = Clock.nowMs();
    const upsert = SqliteClient.statement(
      `INSERT INTO ${Table.SIGHTING}
        (volume_name, first_seen_at, last_seen_at, last_seen_attached_at, last_consumers)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (volume_name) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         -- Only advance the attachment marker when consumers were actually observed.
         last_seen_attached_at = COALESCE(excluded.last_seen_attached_at, ${Table.SIGHTING}.last_seen_attached_at),
         last_consumers = COALESCE(excluded.last_consumers, ${Table.SIGHTING}.last_consumers)`,
    );

    SqliteClient.transaction(() => {
      for (const observation of observations) {
        const attached = observation.consumerNames.length > 0;
        upsert.run(
          observation.volumeName,
          now,
          now,
          attached ? now : null,
          attached ? JSON.stringify(observation.consumerNames) : null,
        );
      }
    });
  },

  find(volumeName: string): StoredSighting | null {
    const row = SqliteClient.selectOne<SightingRow>(
      `SELECT ${SELECT_COLUMNS} FROM ${Table.SIGHTING} WHERE volume_name = ?`,
      volumeName,
    );

    return row ? _toStored(row) : null;
  },

  findAll(): Map<string, StoredSighting> {
    const rows = SqliteClient.select<SightingRow>(`SELECT ${SELECT_COLUMNS} FROM ${Table.SIGHTING}`);
    return new Map(rows.map((row) => [row.volume_name, _toStored(row)] as const));
  },

  /** Oldest observation in the ledger: how far back our own knowledge reaches. */
  trackingSinceMs(): number | null {
    const row = SqliteClient.selectOne<{ first_seen_at: number | null }>(
      `SELECT MIN(first_seen_at) AS first_seen_at FROM ${Table.SIGHTING}`,
    );

    return row?.first_seen_at ?? null;
  },

  forget(volumeName: string): void {
    SqliteClient.execute(`DELETE FROM ${Table.SIGHTING} WHERE volume_name = ?`, volumeName);
  },
});
