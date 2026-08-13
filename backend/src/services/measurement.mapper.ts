import { EntryKind, MeasurementFreshness } from '@leviosa/shared';
import type { SizeMeasurement, VolumeEntry } from '@leviosa/shared';
import { Config, ScanProtocol } from '../config/index.config.js';
import type { StoredMeasurement } from '../store/index.store.js';
import type { RawEntry } from '../types/internal.types.js';
import { Clock, VolumePath } from '../utils/index.utils.js';

/** Probe kind tokens are single characters; the wire uses explicit names. */
const KIND_BY_TOKEN: Readonly<Record<string, EntryKind>> = Object.freeze({
  [ScanProtocol.EntryKind.DIRECTORY]: EntryKind.DIRECTORY,
  [ScanProtocol.EntryKind.FILE]: EntryKind.FILE,
  [ScanProtocol.EntryKind.SYMLINK]: EntryKind.SYMLINK,
  [ScanProtocol.EntryKind.OTHER]: EntryKind.OTHER,
});

/**
 * Translates persisted measurements into wire shapes. Both the scan queue and the
 * volume service need this, so it lives in one place rather than being reimplemented
 * on each side.
 */
export const MeasurementMapper = Object.freeze({
  toWire(stored: StoredMeasurement): SizeMeasurement {
    return {
      totalBytes: stored.totalBytes,
      fileCount: stored.fileCount,
      directoryCount: stored.directoryCount,
      lastWriteAt: Clock.toIso(stored.lastWriteAtMs),
      source: stored.source,
      measuredAt: new Date(stored.capturedAtMs).toISOString(),
      durationMs: stored.durationMs,
      truncated: stored.truncated,
    };
  },

  /**
   * How much a cached figure should be trusted. A stale row is still shown — a
   * six-hour-old size is far more useful than a spinner — but it is labelled.
   */
  freshnessOf(stored: StoredMeasurement | null): MeasurementFreshness {
    if (!stored) {
      return MeasurementFreshness.UNKNOWN;
    }
    return Clock.isOlderThan(stored.capturedAtMs, Config.scan.cacheTtlMs)
      ? MeasurementFreshness.STALE
      : MeasurementFreshness.FRESH;
  },

  toEntry(raw: RawEntry, parentPath: string): VolumeEntry {
    return {
      name: raw.name,
      path: VolumePath.child(parentPath, raw.name),
      kind: KIND_BY_TOKEN[raw.kind] ?? EntryKind.OTHER,
      sizeBytes: raw.sizeBytes,
      modifiedAt: Clock.toIso(raw.modifiedAtMs),
    };
  },

  toEntries(raws: readonly RawEntry[], parentPath: string): VolumeEntry[] {
    return raws.map((raw) => MeasurementMapper.toEntry(raw, parentPath));
  },
});
