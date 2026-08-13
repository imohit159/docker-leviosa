'use client';

import { Suspense } from 'react';
import { CountFormat } from '@leviosa/shared';
import { useSystemSummary, useVolumeQuery, useVolumes } from '@/hooks/index.hooks';
import { VolumeScope } from '@/lib/constants';
import { Card } from '@/components/ui/card';
import { ErrorState, TableSkeleton } from '@/components/ui/states';
import { FilterBar } from '@/components/volumes/filter-bar';
import { SummaryTiles } from '@/components/volumes/summary-tiles';
import { VolumeTable } from '@/components/volumes/volume-table';
import { ShimmerSkeleton } from '@/components/unlumen-ui/shimmer-skeleton';

/**
 * The inventory view: every volume with its size, dependencies and deletion verdict in
 * one table, sorted biggest-first by default because that is the question that brings
 * people here.
 *
 * The heading follows the scope in the URL rather than saying "Volumes" forever, so a
 * filtered list can never be mistaken for the whole daemon — the single most expensive
 * misread this screen can produce, given a delete button sits two clicks away.
 */
function DashboardView() {
  const { query, usage } = useVolumeQuery();
  const summary = useSystemSummary();
  const volumes = useVolumes(query);

  const scope = VolumeScope.find((entry) => entry.usage === usage) ?? VolumeScope[0];
  const total = volumes.data?.page.total;

  return (
    <div className="flex flex-col gap-5 pt-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">{scope.label}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Size, contents, container dependencies and safe-to-delete guidance for every volume on
          this daemon.
        </p>
      </header>

      {summary.data ? (
        <SummaryTiles summary={summary.data} />
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <ShimmerSkeleton key={index} className="h-[86px]" rounded="lg" />
          ))}
        </div>
      )}

      <Card>
        <div className="border-b border-border px-4 py-2.5">
          <FilterBar
            resultLabel={
              total === undefined
                ? undefined
                : `${CountFormat.humanize(total)} ${total === 1 ? 'volume' : 'volumes'}`
            }
          />
        </div>

        {volumes.isPending ? <TableSkeleton /> : null}

        {volumes.isError ? (
          <ErrorState error={volumes.error} onRetry={() => void volumes.refetch()} />
        ) : null}

        {volumes.data ? (
          <VolumeTable volumes={volumes.data.items} page={volumes.data.page} />
        ) : null}
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  // `useVolumeQuery` reads the query string, which Next requires to sit under a
  // Suspense boundary so the route can still be prerendered.
  return (
    <Suspense fallback={<TableSkeleton />}>
      <DashboardView />
    </Suspense>
  );
}
