import { constants as fsConstants } from 'node:fs';
import { access, lstat, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { Dirent, Stats } from 'node:fs';
import { ScanSource } from '@leviosa/shared';
import { Config, ScanProtocol } from '../config/index.config.js';
import { ApiErrors, Logger, VolumePath } from '../utils/index.utils.js';
import type { RawEntry, RawListing } from '../types/internal.types.js';
import type { MeasureOutcome, ScanStrategy, StrategyTarget } from './scan.strategy.js';

const log = Logger.for('scanner:host-fs');

/** `du` accounts for allocated blocks, not apparent size. 512 bytes per block is POSIX. */
const BYTES_PER_BLOCK = 512;

interface WalkTotals {
  bytes: number;
  files: number;
  directories: number;
  newestMtimeMs: number;
  truncated: boolean;
}

interface WalkContext {
  deadlineMs: number;
  /** `dev:ino` of multiply-linked files already counted, mirroring `du` semantics. */
  countedInodes: Set<string>;
  totals: WalkTotals;
}

function _emptyTotals(): WalkTotals {
  return { bytes: 0, files: 0, directories: 0, newestMtimeMs: 0, truncated: false };
}

/** Allocated size, matching what `du` would report, with an apparent-size fallback. */
function _allocatedBytes(stats: Stats): number {
  return Number.isFinite(stats.blocks) && stats.blocks > 0 ? stats.blocks * BYTES_PER_BLOCK : stats.size;
}

/** Counts a regular file once even when several hard links point at it. */
function _countFileBytes(stats: Stats, context: WalkContext): number {
  if (stats.nlink > 1) {
    const key = `${String(stats.dev)}:${String(stats.ino)}`;
    if (context.countedInodes.has(key)) {
      return 0;
    }
    context.countedInodes.add(key);
  }
  return _allocatedBytes(stats);
}

function _noteMtime(stats: Stats, context: WalkContext): void {
  const mtime = stats.mtimeMs;
  if (mtime > context.totals.newestMtimeMs) {
    context.totals.newestMtimeMs = mtime;
  }
}

/**
 * Recursively accumulates one subtree. Returns the byte total for that subtree while
 * folding counts into the shared context, so the whole tree is walked exactly once
 * even though the caller also wants a per-child breakdown.
 */
async function _walk(directory: string, context: WalkContext): Promise<number> {
  if (Date.now() > context.deadlineMs) {
    context.totals.truncated = true;
    return 0;
  }

  let children: Dirent[];
  try {
    children = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    // Unreadable subdirectories are skipped, not fatal: the total becomes a lower bound.
    log.debug({ err: error, directory }, 'skipping unreadable directory');
    context.totals.truncated = true;
    return 0;
  }

  let subtreeBytes = 0;

  try {
    const stats = await lstat(directory);
    subtreeBytes += _allocatedBytes(stats);
    _noteMtime(stats, context);
  } catch {
    context.totals.truncated = true;
  }

  for (const child of children) {
    const childPath = join(directory, child.name);

    if (child.isDirectory()) {
      context.totals.directories += 1;
      subtreeBytes += await _walk(childPath, context);
      continue;
    }

    try {
      const stats = await lstat(childPath);
      _noteMtime(stats, context);
      if (child.isFile()) {
        context.totals.files += 1;
        subtreeBytes += _countFileBytes(stats, context);
      }
    } catch {
      context.totals.truncated = true;
    }
  }

  return subtreeBytes;
}

function _kindOf(entry: Dirent): string {
  if (entry.isSymbolicLink()) {
    return ScanProtocol.EntryKind.SYMLINK;
  }
  if (entry.isDirectory()) {
    return ScanProtocol.EntryKind.DIRECTORY;
  }
  if (entry.isFile()) {
    return ScanProtocol.EntryKind.FILE;
  }
  return ScanProtocol.EntryKind.OTHER;
}

/** Depth-one listing where directory sizes are their recursive totals. */
async function _listDirectory(
  absolutePath: string,
  context: WalkContext,
): Promise<{ entries: RawEntry[]; truncated: boolean }> {
  let children: Dirent[];
  try {
    children = await readdir(absolutePath, { withFileTypes: true });
  } catch (error) {
    throw ApiErrors.scanFailed(absolutePath, 'directory is not readable by this process', error);
  }

  const capped = children.slice(0, Config.scan.browseMaxEntries);
  const entries: RawEntry[] = [];

  for (const child of capped) {
    const childPath = join(absolutePath, child.name);
    const kind = _kindOf(child);

    let sizeBytes = 0;
    let modifiedAtMs: number | null = null;

    try {
      const stats = await lstat(childPath);
      modifiedAtMs = Math.round(stats.mtimeMs);
      if (kind === ScanProtocol.EntryKind.DIRECTORY) {
        sizeBytes = await _walk(childPath, context);
        context.totals.directories += 1;
      } else if (kind === ScanProtocol.EntryKind.FILE) {
        sizeBytes = _countFileBytes(stats, context);
        context.totals.files += 1;
      }
      _noteMtime(stats, context);
    } catch {
      context.totals.truncated = true;
    }

    entries.push({ name: child.name, kind, sizeBytes, modifiedAtMs });
  }

  entries.sort((left, right) => right.sizeBytes - left.sizeBytes);
  return { entries, truncated: children.length > capped.length };
}

/**
 * Reads the daemon's volume mountpoint directly from this process.
 *
 * Strictly an optimisation: it skips container startup entirely, but it only works
 * when the API runs on the same host as the daemon, that host is Linux, and this
 * process can traverse `/var/lib/docker/volumes` — which is root-owned and mode 0700
 * on a stock install. Availability is therefore re-checked per volume rather than
 * assumed.
 */
export const HostFsStrategy: ScanStrategy = Object.freeze({
  source: ScanSource.HOST_FS,

  async isUsable(target: StrategyTarget): Promise<boolean> {
    if (!Config.scan.allowHostFs || target.mountpoint.length === 0) {
      return false;
    }
    try {
      await access(target.mountpoint, fsConstants.R_OK | fsConstants.X_OK);
      return true;
    } catch {
      return false;
    }
  },

  async measure(target: StrategyTarget): Promise<MeasureOutcome> {
    const startedAt = Date.now();
    const context: WalkContext = {
      deadlineMs: startedAt + Config.scan.timeoutMs,
      countedInodes: new Set<string>(),
      totals: _emptyTotals(),
    };

    const listing = await _listDirectory(target.mountpoint, context);

    let totalBytes = 0;
    try {
      const stats = await lstat(target.mountpoint);
      totalBytes += _allocatedBytes(stats);
      _noteMtime(stats, context);
    } catch {
      context.totals.truncated = true;
    }
    for (const entry of listing.entries) {
      totalBytes += entry.sizeBytes;
    }

    return {
      measurement: {
        totalBytes,
        fileCount: context.totals.files,
        directoryCount: context.totals.directories,
        lastWriteAtMs: context.totals.newestMtimeMs > 0 ? Math.round(context.totals.newestMtimeMs) : null,
        source: ScanSource.HOST_FS,
        durationMs: Date.now() - startedAt,
        truncated: context.totals.truncated || listing.truncated,
      },
      entries: listing.entries,
    };
  },

  async list(target: StrategyTarget, path: string): Promise<RawListing> {
    const normalized = VolumePath.normalize(path);
    if (normalized === null) {
      throw ApiErrors.pathTraversal(path);
    }

    const requested = VolumePath.toContainerPath(target.mountpoint, normalized);

    // Resolve symlinks before trusting the path: a link inside the volume could
    // otherwise walk us out into the host filesystem.
    const [root, absolute] = await Promise.all([
      realpath(target.mountpoint).catch(() => target.mountpoint),
      realpath(requested).catch(() => null),
    ]);
    if (absolute === null) {
      throw ApiErrors.pathNotFound(target.volumeName, normalized);
    }
    if (absolute !== root && !absolute.startsWith(`${root}/`)) {
      throw ApiErrors.pathTraversal(path);
    }

    const stats = await lstat(absolute).catch(() => null);
    if (!stats?.isDirectory()) {
      throw ApiErrors.pathNotFound(target.volumeName, normalized);
    }

    const context: WalkContext = {
      deadlineMs: Date.now() + Config.scan.timeoutMs,
      countedInodes: new Set<string>(),
      totals: _emptyTotals(),
    };

    const listing = await _listDirectory(absolute, context);
    return { entries: listing.entries, truncated: listing.truncated || context.totals.truncated };
  },
});
