/**
 * The single source of truth for URL shapes. The Express router mounts these and
 * the Next.js client builds requests from them, so a path can never drift on one
 * side only.
 */
export const API_VERSION = 'v1' as const;
export const API_PREFIX = `/api/${API_VERSION}` as const;

/** Path segments, kept separate from the builders so the router can reuse them. */
export const ResourcePath = Object.freeze({
  HEALTH: '/health',
  VOLUMES: '/volumes',
  JOBS: '/jobs',
  SYSTEM: '/system',
} as const);

/** Sub-resource segments hung off a single volume. */
export const VolumeSubPath = Object.freeze({
  ENTRIES: 'entries',
  GROWTH: 'growth',
  SCANS: 'scans',
} as const);

export const ApiRoute = Object.freeze({
  health(): string {
    return `${API_PREFIX}${ResourcePath.HEALTH}`;
  },

  systemSummary(): string {
    return `${API_PREFIX}${ResourcePath.SYSTEM}/summary`;
  },

  volumes(): string {
    return `${API_PREFIX}${ResourcePath.VOLUMES}`;
  },

  volume(name: string): string {
    return `${API_PREFIX}${ResourcePath.VOLUMES}/${encodeURIComponent(name)}`;
  },

  volumeEntries(name: string): string {
    return `${ApiRoute.volume(name)}/${VolumeSubPath.ENTRIES}`;
  },

  volumeGrowth(name: string): string {
    return `${ApiRoute.volume(name)}/${VolumeSubPath.GROWTH}`;
  },

  volumeScans(name: string): string {
    return `${ApiRoute.volume(name)}/${VolumeSubPath.SCANS}`;
  },

  job(id: string): string {
    return `${API_PREFIX}${ResourcePath.JOBS}/${encodeURIComponent(id)}`;
  },
});
