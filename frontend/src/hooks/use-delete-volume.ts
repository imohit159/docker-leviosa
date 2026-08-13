'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VolumeDeleteResult } from '@leviosa/shared';
import { VolumeApi } from '@/lib/api.endpoints';
import { ApiRequestError } from '@/lib/api.client';
import { QueryKey } from '@/lib/query-keys';

/**
 * Volume removal. The confirmation token is passed through untouched — this hook does
 * not synthesise it from the volume name, because the entire point of the token is that
 * a human typed it.
 */
export function useDeleteVolume(onDeleted?: (result: VolumeDeleteResult) => void) {
  const queryClient = useQueryClient();

  return useMutation<VolumeDeleteResult, ApiRequestError, { name: string; confirm: string }>({
    mutationFn: ({ name, confirm }) => VolumeApi.remove(name, confirm),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: QueryKey.allVolumes() });
      void queryClient.invalidateQueries({ queryKey: QueryKey.systemSummary() });
      queryClient.removeQueries({ queryKey: QueryKey.volume(result.name) });
      onDeleted?.(result);
    },
  });
}
