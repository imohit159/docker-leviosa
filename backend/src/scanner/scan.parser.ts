import { posix } from 'node:path';
import { ScanProtocol } from '../config/index.config.js';
import { Bytes, Clock } from '../utils/index.utils.js';
import type { RawEntry } from '../types/internal.types.js';

const { PREFIX, DELIMITER, Record: R } = ScanProtocol;
const LINE_START = `${PREFIX}${DELIMITER}`;

/** Field positions inside a record, after `PREFIX` and the record type. */
const Field = Object.freeze({
  DU_KIB: 2,
  DU_PATH: 3,
  STAT_KIND: 2,
  STAT_SIZE: 3,
  STAT_MTIME: 4,
  STAT_PATH: 5,
  SCALAR_VALUE: 2,
  BASE_PATH: 2,
} as const);

export interface ParsedScan {
  /** Symlink-resolved directory the probe actually walked. */
  base: string | null;
  /** Recursive total for `base`, taken from its own `du` line. */
  totalBytes: number;
  entries: RawEntry[];
  fileCount: number;
  /** Already excludes `base` itself. */
  directoryCount: number;
  lastWriteAtMs: number | null;
  truncated: boolean;
  /** Script-reported failure token, e.g. OUTSIDE_ROOT. */
  error: string | null;
  /** True only when the END sentinel arrived, proving the probe was not killed. */
  completed: boolean;
}

function _toInt(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Rejoins a path that legitimately contains the delimiter character. */
function _joinFrom(parts: string[], index: number): string {
  return parts.slice(index).join(DELIMITER);
}

/**
 * Turns probe stdout into a structured result. Unrecognised or malformed lines are
 * dropped rather than throwing: a single pathological filename must not invalidate
 * an otherwise complete measurement.
 */
export const ScanParser = Object.freeze({
  parse(stdout: string): ParsedScan {
    let base: string | null = null;
    let fileCount = 0;
    let directoryCountRaw = 0;
    let lastWriteAtMs: number | null = null;
    let truncated = false;
    let error: string | null = null;
    let completed = false;

    /** Absolute path -> recursive bytes, for `base` and its immediate child dirs. */
    const directorySizes = new Map<string, number>();
    /** Depth-one children in discovery order, before directory sizes are merged. */
    const stats: Array<{ path: string; kind: string; sizeBytes: number; modifiedAtMs: number | null }> = [];

    for (const line of stdout.split('\n')) {
      if (!line.startsWith(LINE_START)) {
        continue;
      }

      const parts = line.trimEnd().split(DELIMITER);
      const type = parts[1];

      switch (type) {
        case R.BASE:
          base = _joinFrom(parts, Field.BASE_PATH);
          break;

        case R.DU:
          directorySizes.set(_joinFrom(parts, Field.DU_PATH), Bytes.fromKib(_toInt(parts[Field.DU_KIB])));
          break;

        case R.STAT:
          stats.push({
            path: _joinFrom(parts, Field.STAT_PATH),
            kind: parts[Field.STAT_KIND] ?? ScanProtocol.EntryKind.OTHER,
            sizeBytes: _toInt(parts[Field.STAT_SIZE]),
            modifiedAtMs: Clock.fromEpochSeconds(_toInt(parts[Field.STAT_MTIME])),
          });
          break;

        case R.FILE_COUNT:
          fileCount = _toInt(parts[Field.SCALAR_VALUE]);
          break;

        case R.DIR_COUNT:
          directoryCountRaw = _toInt(parts[Field.SCALAR_VALUE]);
          break;

        case R.LAST_WRITE:
          lastWriteAtMs = Clock.fromEpochSeconds(_toInt(parts[Field.SCALAR_VALUE]));
          break;

        case R.TRUNCATED:
          truncated = true;
          break;

        case R.ERROR:
          error = parts[Field.SCALAR_VALUE] ?? 'UNKNOWN';
          break;

        case R.END:
          completed = true;
          break;

        default:
          break;
      }
    }

    const entries: RawEntry[] = stats.map((stat) => ({
      name: posix.basename(stat.path),
      kind: stat.kind,
      // Directory sizes come from `du`; only files carry a meaningful `stat` size.
      sizeBytes:
        stat.kind === ScanProtocol.EntryKind.DIRECTORY
          ? (directorySizes.get(stat.path) ?? 0)
          : stat.sizeBytes,
      modifiedAtMs: stat.modifiedAtMs,
    }));

    entries.sort((left, right) => right.sizeBytes - left.sizeBytes);

    return {
      base,
      totalBytes: base === null ? 0 : (directorySizes.get(base) ?? 0),
      entries,
      fileCount,
      // `find -type d` counts the base directory too.
      directoryCount: Math.max(0, directoryCountRaw - 1),
      lastWriteAtMs,
      truncated,
      error,
      completed,
    };
  },
});
