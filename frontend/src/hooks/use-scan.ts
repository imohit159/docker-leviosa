'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { JobState } from '@leviosa/shared';
import type { ScanJob } from '@leviosa/shared';
import { JobApi, VolumeApi } from '@/lib/api.endpoints';
import { PollInterval } from '@/lib/constants';
import { QueryKey } from '@/lib/query-keys';

function _isSettled(state: JobState | undefined): boolean {
  return state === JobState.SUCCEEDED || state === JobState.FAILED || state === JobState.CANCELLED;
}

export interface ScanController {
  start: () => void;
  isStarting: boolean;
  job: ScanJob | null;
  /** True from submission until the job settles. */
  isRunning: boolean;
  error: string | null;
}

/**
 * Drives one volume's measurement: submit, poll, then refresh the caches the result
 * changed.
 *
 * Polling rather than streaming is a deliberate scope choice. A scan reports no
 * intermediate progress — `du` either finishes a subtree or it does not — so a
 * subscription would deliver the same single state transition an interval already
 * catches, at the cost of an SSE endpoint and its reconnection logic.
 */
export function useScan(volumeName: string): ScanController {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const settledRef = useRef(false);

  const mutation = useMutation({
    mutationFn: () => VolumeApi.scan(volumeName),
    onSuccess: (job) => {
      settledRef.current = false;
      setJobId(job.id);
    },
  });

  const jobQuery = useQuery<ScanJob>({
    queryKey: QueryKey.job(jobId ?? ''),
    queryFn: () => JobApi.detail(jobId as string),
    enabled: jobId !== null,
    refetchInterval: (query) =>
      _isSettled(query.state.data?.state) ? false : PollInterval.ACTIVE_JOB_MS,
  });

  const job = jobQuery.data ?? null;

  useEffect(() => {
    if (!job || !_isSettled(job.state) || settledRef.current) {
      return;
    }
    settledRef.current = true;
    // The measurement is now the newest row for this volume; every view of it is stale.
    void queryClient.invalidateQueries({ queryKey: QueryKey.allVolumes() });
    void queryClient.invalidateQueries({ queryKey: QueryKey.volume(volumeName) });
    void queryClient.invalidateQueries({ queryKey: QueryKey.systemSummary() });
  }, [job, queryClient, volumeName]);

  const start = useCallback(() => {
    mutation.mutate();
  }, [mutation]);

  const isRunning =
    mutation.isPending || (job !== null && !_isSettled(job.state)) || (jobId !== null && job === null);

  const error = job?.error ?? (mutation.error instanceof Error ? mutation.error.message : null);

  return { start, isStarting: mutation.isPending, job, isRunning, error };
}
