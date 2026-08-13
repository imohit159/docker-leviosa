'use client';

import { useQuery } from '@tanstack/react-query';
import { GrowthDefaults } from '@leviosa/shared';
import type { VolumeBrowseResult, VolumeDetail } from '@leviosa/shared';
import { VolumeApi } from '@/lib/api.endpoints';
import { PollInterval, QueryConfig } from '@/lib/constants';
import { QueryKey } from '@/lib/query-keys';

export function useVolumeDetail(name: string, days: number = GrowthDefaults.DAYS) {
  return useQuery<VolumeDetail>({
    queryKey: QueryKey.volume(name),
    queryFn: () => VolumeApi.detail(name, days),
    refetchInterval: PollInterval.INVENTORY_MS,
    staleTime: QueryConfig.STALE_TIME_MS,
    retry: QueryConfig.RETRY_COUNT,
  });
}

/**
 * Directory listing. Every navigation is a live call into the volume rather than a
 * slice of the cached measurement, because a stale file listing is worse than no
 * listing; `enabled` lets the caller defer until the user opens the browser.
 */
export function useVolumeEntries(name: string, path: string, enabled: boolean) {
  return useQuery<VolumeBrowseResult>({
    queryKey: QueryKey.volumeEntries(name, path),
    queryFn: () => VolumeApi.entries(name, path),
    enabled,
    staleTime: QueryConfig.STALE_TIME_MS,
    retry: QueryConfig.RETRY_COUNT,
  });
}
