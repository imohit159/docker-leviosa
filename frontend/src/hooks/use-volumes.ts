'use client';

import { useQuery } from '@tanstack/react-query';
import type { Paginated, VolumeListQuery, VolumeSummary } from '@leviosa/shared';
import { VolumeApi } from '@/lib/api.endpoints';
import { PollInterval, QueryConfig } from '@/lib/constants';
import { QueryKey } from '@/lib/query-keys';

/**
 * The volume collection. Filtering and sorting are server-side so the list and its
 * page descriptor always agree — paginating a locally-filtered copy is how "showing 1-50
 * of 12" bugs are born.
 */
export function useVolumes(query: VolumeListQuery) {
  return useQuery<Paginated<VolumeSummary>>({
    queryKey: QueryKey.volumes(query),
    queryFn: () => VolumeApi.list(query),
    refetchInterval: PollInterval.INVENTORY_MS,
    staleTime: QueryConfig.STALE_TIME_MS,
    retry: QueryConfig.RETRY_COUNT,
    // Keeps the table populated while a filter change is in flight, instead of
    // collapsing to a spinner on every keystroke.
    placeholderData: (previous) => previous,
  });
}
