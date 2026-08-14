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
  HOSTS: '/hosts',
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

/** Sub-resource segments hung off a single host. */
export const HostSubPath = Object.freeze({
  /** Probe the connection without persisting anything. */
  TEST: 'test',
  /** Accept a presented host key fingerprint. */
  TRUST: 'trust',
} as const);

export const ApiRoute = Object.freeze({
  health(): string {
    return `${API_PREFIX}${ResourcePath.HEALTH}`;
  },

  hosts(): string {
    return `${API_PREFIX}${ResourcePath.HOSTS}`;
  },

  host(hostId: string): string {
    return `${API_PREFIX}${ResourcePath.HOSTS}/${encodeURIComponent(hostId)}`;
  },

  hostTest(hostId: string): string {
    return `${ApiRoute.host(hostId)}/${HostSubPath.TEST}`;
  },

  hostTrust(hostId: string): string {
    return `${ApiRoute.host(hostId)}/${HostSubPath.TRUST}`;
  },

  /**
   * Volumes are nested under their host rather than taking a `?host=` parameter.
   *
   * A volume genuinely belongs to one daemon, so the hierarchy is honest, and it makes
   * the host impossible to omit by accident — a query parameter silently defaults when
   * forgotten, and here that would mean reading the wrong machine.
   */
  systemSummary(hostId: string): string {
    return `${ApiRoute.host(hostId)}${ResourcePath.SYSTEM}/summary`;
  },

  volumes(hostId: string): string {
    return `${ApiRoute.host(hostId)}${ResourcePath.VOLUMES}`;
  },

  volume(hostId: string, name: string): string {
    return `${ApiRoute.volumes(hostId)}/${encodeURIComponent(name)}`;
  },

  volumeEntries(hostId: string, name: string): string {
    return `${ApiRoute.volume(hostId, name)}/${VolumeSubPath.ENTRIES}`;
  },

  volumeGrowth(hostId: string, name: string): string {
    return `${ApiRoute.volume(hostId, name)}/${VolumeSubPath.GROWTH}`;
  },

  volumeScans(hostId: string, name: string): string {
    return `${ApiRoute.volume(hostId, name)}/${VolumeSubPath.SCANS}`;
  },

  /** Jobs carry their own host, so the id alone identifies one. */
  job(id: string): string {
    return `${API_PREFIX}${ResourcePath.JOBS}/${encodeURIComponent(id)}`;
  },
});
