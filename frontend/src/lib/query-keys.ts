import type { VolumeListQuery } from '@leviosa/shared';

/**
 * Centralised React Query keys. Invalidation is the whole reason: a mutation needs to
 * name exactly the caches it affects, and hand-written key arrays scattered across
 * hooks are how stale UI happens.
 *
 * Every volume-scoped key carries the host id, and carries it directly after the
 * resource name so prefix invalidation stays per host. Without it, two hosts with a
 * volume called `postgres_data` would share one cache entry and switching hosts would
 * show the previous machine's numbers under the new machine's name.
 */
export const QueryKey = Object.freeze({
  volumes: (hostId: string, query: VolumeListQuery) => ['volumes', hostId, query] as const,
  /** Prefix matcher: every filter combination for one host. */
  allVolumes: (hostId: string) => ['volumes', hostId] as const,
  volume: (hostId: string, name: string) => ['volume', hostId, name] as const,
  volumeEntries: (hostId: string, name: string, path: string) =>
    ['volume-entries', hostId, name, path] as const,
  volumeGrowth: (hostId: string, name: string, days: number) =>
    ['volume-growth', hostId, name, days] as const,
  job: (id: string) => ['job', id] as const,
  systemSummary: (hostId: string) => ['system-summary', hostId] as const,
  /** Host-agnostic: the registry and the health report both span every host. */
  hosts: () => ['hosts'] as const,
  health: () => ['health'] as const,
});
