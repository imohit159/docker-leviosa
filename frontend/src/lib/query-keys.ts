import type { VolumeListQuery } from '@leviosa/shared';

/**
 * Centralised React Query keys. Invalidation is the whole reason: a mutation needs to
 * name exactly the caches it affects, and hand-written key arrays scattered across
 * hooks are how stale UI happens.
 */
export const QueryKey = Object.freeze({
  volumes: (query: VolumeListQuery) => ['volumes', query] as const,
  /** Prefix matcher: invalidates every filter combination at once. */
  allVolumes: () => ['volumes'] as const,
  volume: (name: string) => ['volume', name] as const,
  volumeEntries: (name: string, path: string) => ['volume-entries', name, path] as const,
  volumeGrowth: (name: string, days: number) => ['volume-growth', name, days] as const,
  job: (id: string) => ['job', id] as const,
  systemSummary: () => ['system-summary'] as const,
  health: () => ['health'] as const,
});
