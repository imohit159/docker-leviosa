'use client';

import { useState } from 'react';
import { PaginationDefaults, VolumeListDefaults } from '@leviosa/shared';
import type { VolumeListQuery } from '@leviosa/shared';
import { useSystemSummary, useVolumes } from '@/hooks/index.hooks';
import { Card } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { FilterBar } from '@/components/volumes/filter-bar';
import { SummaryTiles } from '@/components/volumes/summary-tiles';
import { VolumeTable } from '@/components/volumes/volume-table';

const INITIAL_QUERY: VolumeListQuery = {
  sort: VolumeListDefaults.SORT,
  order: VolumeListDefaults.ORDER,
  limit: PaginationDefaults.LIMIT,
  offset: PaginationDefaults.OFFSET,
};

/**
 * The inventory view: every volume with its size, dependencies and deletion verdict in
 * one table, sorted biggest-first by default because that is the question that brings
 * people here.
 */
export default function DashboardPage() {
  const [query, setQuery] = useState<VolumeListQuery>(INITIAL_QUERY);
  const summary = useSystemSummary();
  const volumes = useVolumes(query);

  return (
    <div className="flex flex-col gap-6 pt-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Volumes</h1>
        <p className="mt-1 text-sm text-content-muted">
          Size, contents, container dependencies and safe-to-delete guidance for every volume on
          this daemon.
        </p>
      </div>

      {summary.data ? <SummaryTiles summary={summary.data} /> : null}

      <Card>
        <div className="border-b border-border-subtle px-5 py-3.5">
          <FilterBar query={query} onChange={setQuery} />
        </div>

        {volumes.isPending ? <LoadingState label="Reading volume inventory" /> : null}

        {volumes.isError ? (
          <ErrorState error={volumes.error} onRetry={() => void volumes.refetch()} />
        ) : null}

        {volumes.data ? (
          <VolumeTable
            volumes={volumes.data.items}
            page={volumes.data.page}
            onOffsetChange={(offset) => setQuery({ ...query, offset })}
          />
        ) : null}
      </Card>
    </div>
  );
}
