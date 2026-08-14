'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HostStatus } from '@leviosa/shared';
import type { CreateHostInput, DockerHost, HostConnectionTest, UpdateHostInput } from '@leviosa/shared';
import { HostApi } from '@/lib/api.endpoints';
import { LOCAL_HOST_ID, PollInterval, QueryConfig } from '@/lib/constants';
import { QueryKey } from '@/lib/query-keys';
import { useHealth } from './use-system';

/** `/hosts/<id>/...` — the only place the host segment is read out of a URL. */
const HOST_SEGMENT_PATTERN = /^\/hosts\/([^/]+)/;

/**
 * The host the current page is about, taken from the URL.
 *
 * Derived from the pathname rather than held in state, so the address bar stays the
 * single source of truth: a reload, a back button and a pasted link all resolve to the
 * same machine. Falls back to the local host for routes with no host segment, which is
 * the only sensible default for a page that never named one.
 */
export function useHostId(): string {
  const pathname = usePathname();

  return useMemo(() => {
    const matched = HOST_SEGMENT_PATTERN.exec(pathname);
    return matched?.[1] ? decodeURIComponent(matched[1]) : LOCAL_HOST_ID;
  }, [pathname]);
}

/** Every registered host. Cheap and rarely changing, so it polls slowly. */
export function useHosts() {
  return useQuery<DockerHost[]>({
    queryKey: QueryKey.hosts(),
    queryFn: () => HostApi.list(),
    refetchInterval: PollInterval.HEALTH_MS,
    staleTime: QueryConfig.STALE_TIME_MS,
    retry: QueryConfig.RETRY_COUNT,
    placeholderData: (previous) => previous,
  });
}

export interface HostWithStatus extends DockerHost {
  /** Live reachability from the health report, which actually probes the daemon. */
  reachable: boolean;
}

/**
 * The host list joined with live reachability.
 *
 * The registry endpoint deliberately does not probe each host — rendering a dropdown
 * must not open an SSH connection per row — so reachability comes from the health
 * report, which probes once for everything and is polled on its own cadence.
 */
export function useHostsWithStatus(): { hosts: HostWithStatus[]; isLoading: boolean } {
  const hostsQuery = useHosts();
  const healthQuery = useHealth();

  const hosts = useMemo(() => {
    const reachability = new Map(
      (healthQuery.data?.hosts ?? []).map((entry) => [entry.hostId, entry.reachable] as const),
    );

    return (hostsQuery.data ?? []).map((host) => ({
      ...host,
      reachable: reachability.get(host.id) ?? false,
      status: host.enabled
        ? reachability.get(host.id)
          ? HostStatus.ONLINE
          : HostStatus.OFFLINE
        : HostStatus.DISABLED,
    }));
  }, [hostsQuery.data, healthQuery.data]);

  return { hosts, isLoading: hostsQuery.isLoading };
}

/** The record for the host the current page is about, once the list has loaded. */
export function useCurrentHost(): HostWithStatus | null {
  const hostId = useHostId();
  const { hosts } = useHostsWithStatus();
  return hosts.find((host) => host.id === hostId) ?? null;
}

function _useHostMutationRefresh(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: QueryKey.hosts() });
    void queryClient.invalidateQueries({ queryKey: QueryKey.health() });
  };
}

export function useCreateHost() {
  const refresh = _useHostMutationRefresh();
  return useMutation<DockerHost, Error, CreateHostInput>({
    mutationFn: (input) => HostApi.create(input),
    onSuccess: refresh,
  });
}

export function useUpdateHost() {
  const refresh = _useHostMutationRefresh();
  return useMutation<DockerHost, Error, { hostId: string; patch: UpdateHostInput }>({
    mutationFn: ({ hostId, patch }) => HostApi.update(hostId, patch),
    onSuccess: refresh,
  });
}

export function useRemoveHost() {
  const refresh = _useHostMutationRefresh();
  return useMutation<{ id: string; deleted: boolean }, Error, string>({
    mutationFn: (hostId) => HostApi.remove(hostId),
    onSuccess: refresh,
  });
}

/** Probes a connection. Resolves with the failure rather than rejecting on one. */
export function useTestHost() {
  return useMutation<HostConnectionTest, Error, string>({
    mutationFn: (hostId) => HostApi.test(hostId),
  });
}

export function useTrustHostKey() {
  const refresh = _useHostMutationRefresh();
  return useMutation<DockerHost, Error, { hostId: string; fingerprint: string }>({
    mutationFn: ({ hostId, fingerprint }) => HostApi.trust(hostId, fingerprint),
    onSuccess: refresh,
  });
}
