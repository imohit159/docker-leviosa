import { posix } from 'node:path';
import { BrowseDefaults } from '@leviosa/shared';

const NUL = '\u0000';
const PARENT_SEGMENT = '..';

/**
 * Volume-relative path hygiene. Callers hand us untrusted input that eventually
 * becomes an argument to a shell inside a container, so it is normalised and
 * validated here first. The sidecar performs a second, independent realpath check
 * to defeat symlinks that only resolve inside the container.
 */
export const VolumePath = Object.freeze({
  /**
   * Returns a normalised absolute volume-relative path, or null when the input is
   * unusable (traversal, NUL byte, over-long).
   */
  normalize(input: string | undefined | null): string | null {
    const raw = (input ?? BrowseDefaults.ROOT_PATH).trim();
    if (raw.length === 0) {
      return BrowseDefaults.ROOT_PATH;
    }
    if (raw.length > BrowseDefaults.MAX_PATH_LENGTH || raw.includes(NUL)) {
      return null;
    }

    const absolute = raw.startsWith('/') ? raw : `/${raw}`;
    const normalized = posix.normalize(absolute);

    // `normalize` collapses interior `..`, so any survivor escaped the root.
    if (normalized === PARENT_SEGMENT || normalized.split('/').includes(PARENT_SEGMENT)) {
      return null;
    }

    return VolumePath.stripTrailingSlash(normalized);
  },

  /** Parent of a volume-relative path, or null at the root. */
  parentOf(path: string): string | null {
    if (path === BrowseDefaults.ROOT_PATH) {
      return null;
    }
    return VolumePath.stripTrailingSlash(posix.dirname(path));
  },

  /** Joins a volume-relative directory with a single child name. */
  child(parent: string, name: string): string {
    return VolumePath.stripTrailingSlash(posix.join(parent, name));
  },

  /** Absolute path inside the sidecar for a volume-relative path. */
  toContainerPath(mountTarget: string, path: string): string {
    return path === BrowseDefaults.ROOT_PATH ? mountTarget : posix.join(mountTarget, path);
  },

  stripTrailingSlash(path: string): string {
    if (path.length > 1 && path.endsWith('/')) {
      return path.slice(0, -1);
    }
    return path;
  },
});
