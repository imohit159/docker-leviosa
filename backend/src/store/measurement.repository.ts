import { MillisIn } from '@leviosa/shared';
import type { ScanSource } from '@leviosa/shared';
import { Config, Table } from '../config/index.config.js';
import { Clock, Logger } from '../utils/index.utils.js';
import type { RawEntry, RawMeasurement } from '../types/internal.types.js';
import { SqliteClient } from './sqlite.client.js';

const log = Logger.for('store:measurement');

export interface StoredMeasurement {
  volumeName: string;
  totalBytes: number;
  fileCount: number;
  directoryCount: number;
  lastWriteAtMs: number | null;
  source: ScanSource;
  durationMs: number;
  truncated: boolean;
  capturedAtMs: number;
  /** Depth-one breakdown captured alongside the totals. */
  topEntries: RawEntry[];
}

export interface StoredGrowthPoint {
  capturedAtMs: number;
  totalBytes: number;
}

interface MeasurementRow {
  volume_name: string;
  total_bytes: number;
  file_count: number;
  directory_count: number;
  last_write_at: number | null;
  source: string;
  duration_ms: number;
  truncated: number;
  top_entries: string;
  captured_at: number;
}

interface GrowthRow {
  captured_at: number;
  total_bytes: number;
}

const SELECT_COLUMNS = `volume_name, total_bytes, file_count, directory_count, last_write_at,
  source, duration_ms, truncated, top_entries, captured_at`;

function _parseEntries(json: string): RawEntry[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as RawEntry[]) : [];
  } catch {
    return [];
  }
}

function _toStored(row: MeasurementRow): StoredMeasurement {
  return {
    volumeName: row.volume_name,
    totalBytes: row.total_bytes,
    fileCount: row.file_count,
    directoryCount: row.directory_count,
    lastWriteAtMs: row.last_write_at,
    source: row.source as ScanSource,
    durationMs: row.duration_ms,
    truncated: row.truncated === 1,
    capturedAtMs: row.captured_at,
    topEntries: _parseEntries(row.top_entries),
  };
}

export const MeasurementRepository = Object.freeze({
  /** Appends a measurement. Rows are never updated: the series is the feature. */
  record(volumeName: string, measurement: RawMeasurement, entries: readonly RawEntry[]): StoredMeasurement {
    const capturedAtMs = Clock.nowMs();

    SqliteClient.execute(
      `INSERT INTO ${Table.MEASUREMENT}
        (volume_name, total_bytes, file_count, directory_count, last_write_at,
         source, duration_ms, truncated, top_entries, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      volumeName,
      measurement.totalBytes,
      measurement.fileCount,
      measurement.directoryCount,
      measurement.lastWriteAtMs,
      measurement.source,
      measurement.durationMs,
      measurement.truncated ? 1 : 0,
      JSON.stringify(entries),
      capturedAtMs,
    );

    return {
      volumeName,
      totalBytes: measurement.totalBytes,
      fileCount: measurement.fileCount,
      directoryCount: measurement.directoryCount,
      lastWriteAtMs: measurement.lastWriteAtMs,
      source: measurement.source,
      durationMs: measurement.durationMs,
      truncated: measurement.truncated,
      capturedAtMs,
      topEntries: [...entries],
    };
  },

  latest(volumeName: string): StoredMeasurement | null {
    const row = SqliteClient.selectOne<MeasurementRow>(
      `SELECT ${SELECT_COLUMNS} FROM ${Table.MEASUREMENT}
       WHERE volume_name = ? ORDER BY captured_at DESC LIMIT 1`,
      volumeName,
    );

    return row ? _toStored(row) : null;
  },

  /**
   * Newest measurement for every volume in one query. The collection endpoint needs
   * this for all rows at once; issuing one query per volume would be N+1 by design.
   */
  latestForAll(): Map<string, StoredMeasurement> {
    const rows = SqliteClient.select<MeasurementRow>(
      `SELECT ${SELECT_COLUMNS} FROM ${Table.MEASUREMENT} m
       WHERE m.captured_at = (
         SELECT MAX(peer.captured_at) FROM ${Table.MEASUREMENT} peer
         WHERE peer.volume_name = m.volume_name
       )`,
    );

    const byVolume = new Map<string, StoredMeasurement>();
    for (const row of rows) {
      // Two scans can share a millisecond; the first row wins, they are equivalent.
      if (!byVolume.has(row.volume_name)) {
        byVolume.set(row.volume_name, _toStored(row));
      }
    }
    return byVolume;
  },

  /**
   * Growth series, downsampled into fixed time buckets by keeping the last measurement
   * of each bucket. The bucket width is the caller's decision, because the right
   * resolution depends on the window being charted.
   *
   * SQLite resolves the bare `total_bytes` column to the row that produced
   * `MAX(captured_at)`, which is exactly the point we want; on any other engine this
   * would need an explicit window function.
   */
  series(volumeName: string, sinceMs: number, bucketMs: number): StoredGrowthPoint[] {
    const rows = SqliteClient.select<GrowthRow>(
      `SELECT MAX(captured_at) AS captured_at, total_bytes
       FROM ${Table.MEASUREMENT}
       WHERE volume_name = ? AND captured_at >= ?
       GROUP BY captured_at / ?
       ORDER BY captured_at ASC`,
      volumeName,
      sinceMs,
      Math.max(1, Math.floor(bucketMs)),
    );

    return rows.map((row) => ({ capturedAtMs: row.captured_at, totalBytes: row.total_bytes }));
  },

  forget(volumeName: string): void {
    SqliteClient.execute(`DELETE FROM ${Table.MEASUREMENT} WHERE volume_name = ?`, volumeName);
  },

  /** Retention sweep. Keeps the newest row per volume even when it is older than the window. */
  pruneOlderThan(cutoffMs: number): number {
    const removed = SqliteClient.execute(
      `DELETE FROM ${Table.MEASUREMENT}
       WHERE captured_at < ?
         AND id NOT IN (
           SELECT id FROM ${Table.MEASUREMENT} m
           WHERE m.captured_at = (
             SELECT MAX(peer.captured_at) FROM ${Table.MEASUREMENT} peer
             WHERE peer.volume_name = m.volume_name
           )
         )`,
      cutoffMs,
    );

    if (removed > 0) {
      log.info({ removed, retentionDays: Config.database.retentionDays }, 'pruned measurement history');
    }
    return removed;
  },
});
