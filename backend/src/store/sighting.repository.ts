import { Table } from '../config/index.config.js';
import { Clock } from '../utils/index.utils.js';
import { SqliteClient } from './sqlite.client.js';

export interface StoredSighting {
  hostId: string;
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
  host_id: string;
  volume_name: string;
  first_seen_at: number;
  last_seen_at: number;
  last_seen_attached_at: number | null;
  last_consumers: string | null;
}

const SELECT_COLUMNS = 'host_id, volume_name, first_seen_at, last_seen_at, last_seen_attached_at, last_consumers';

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
    hostId: row.host_id,
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
  observe(hostId: string, observations: readonly SightingObservation[]): void {
    if (observations.length === 0) {
      return;
    }

    const now = Clock.nowMs();
    const upsert = SqliteClient.statement(
      `INSERT INTO ${Table.SIGHTING}
        (host_id, volume_name, first_seen_at, last_seen_at, last_seen_attached_at, last_consumers)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (host_id, volume_name) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         -- Only advance the attachment marker when consumers were actually observed.
         last_seen_attached_at = COALESCE(excluded.last_seen_attached_at, ${Table.SIGHTING}.last_seen_attached_at),
         last_consumers = COALESCE(excluded.last_consumers, ${Table.SIGHTING}.last_consumers)`,
    );

    SqliteClient.transaction(() => {
      for (const observation of observations) {
        const attached = observation.consumerNames.length > 0;
        upsert.run(
          hostId,
          observation.volumeName,
          now,
          now,
          attached ? now : null,
          attached ? JSON.stringify(observation.consumerNames) : null,
        );
      }
    });
  },

  find(hostId: string, volumeName: string): StoredSighting | null {
    const row = SqliteClient.selectOne<SightingRow>(
      `SELECT ${SELECT_COLUMNS} FROM ${Table.SIGHTING} WHERE host_id = ? AND volume_name = ?`,
      hostId,
      volumeName,
    );

    return row ? _toStored(row) : null;
  },

  findAll(hostId: string): Map<string, StoredSighting> {
    const rows = SqliteClient.select<SightingRow>(
      `SELECT ${SELECT_COLUMNS} FROM ${Table.SIGHTING} WHERE host_id = ?`,
      hostId,
    );
    return new Map(rows.map((row) => [row.volume_name, _toStored(row)] as const));
  },

  /**
   * Oldest observation for this host: how far back our knowledge of it reaches.
   *
   * Per host rather than global, because a VPS added yesterday has one day of history
   * no matter how long the local daemon has been watched, and reporting the global
   * minimum would claim months of idle-time data this tool never collected.
   */
  trackingSinceMs(hostId: string): number | null {
    const row = SqliteClient.selectOne<{ first_seen_at: number | null }>(
      `SELECT MIN(first_seen_at) AS first_seen_at FROM ${Table.SIGHTING} WHERE host_id = ?`,
      hostId,
    );

    return row?.first_seen_at ?? null;
  },

  forget(hostId: string, volumeName: string): void {
    SqliteClient.execute(
      `DELETE FROM ${Table.SIGHTING} WHERE host_id = ? AND volume_name = ?`,
      hostId,
      volumeName,
    );
  },

  /** Drops a host's ledger when the host is deregistered. */
  forgetHost(hostId: string): number {
    return SqliteClient.execute(`DELETE FROM ${Table.SIGHTING} WHERE host_id = ?`, hostId);
  },
});
