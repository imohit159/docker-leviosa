'use client';

import { useQuery } from '@tanstack/react-query';
import type { HealthReport, SystemSummary } from '@leviosa/shared';
import { SystemApi } from '@/lib/api.endpoints';
import { PollInterval, QueryConfig } from '@/lib/constants';
import { QueryKey } from '@/lib/query-keys';

export function useSystemSummary() {
  return useQuery<SystemSummary>({
    queryKey: QueryKey.systemSummary(),
    queryFn: () => SystemApi.summary(),
    refetchInterval: PollInterval.INVENTORY_MS,
    staleTime: QueryConfig.STALE_TIME_MS,
    retry: QueryConfig.RETRY_COUNT,
    placeholderData: (previous) => previous,
  });
}

/**
 * Daemon reachability. Retries are disabled: a dead socket should surface immediately
 * rather than after a backoff sequence, because it is the first thing to check.
 */
export function useHealth() {
  return useQuery<HealthReport>({
    queryKey: QueryKey.health(),
    queryFn: () => SystemApi.health(),
    refetchInterval: PollInterval.HEALTH_MS,
    retry: false,
  });
}
