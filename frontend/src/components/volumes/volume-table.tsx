'use client';

import { CountFormat, SortDirection, VolumeSortKey } from '@leviosa/shared';
import type { PageMeta, VolumeSummary } from '@leviosa/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useVolumeQuery } from '@/hooks/index.hooks';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import { VolumeRow } from './volume-row';

/**
 * Column definitions.
 *
 * `sortKey` marks the columns that are sortable server-side. Making a header the sort
 * control is the affordance people already reach for in a table; leaving sorting only
 * in a toolbar dropdown means the header lies about being interactive.
 *
 * `hideBelow` is how the table survives a narrow viewport without a horizontal scrollbar:
 * columns drop in reverse order of decision value, so name, status and size — the three
 * that answer "is this the one?" — are the last to go.
 */
const COLUMNS = [
  {
    key: 'name',
    label: 'Volume',
    align: 'left',
    sortKey: VolumeSortKey.NAME,
    hideBelow: null,
    // The widest column by a distance. Volume names are long, generated, and
    // front-loaded with a shared compose prefix, so truncating them early leaves rows
    // that all read the same — the one failure this table cannot afford.
    width: 'w-[34%]',
  },
  { key: 'usage', label: 'Status', align: 'left', sortKey: null, hideBelow: null, width: 'w-[104px]' },
  {
    key: 'size',
    label: 'Size',
    align: 'right',
    sortKey: VolumeSortKey.SIZE,
    hideBelow: null,
    width: 'w-[104px]',
  },
  { key: 'consumers', label: 'Used by', align: 'left', sortKey: null, hideBelow: 'sm', width: 'w-[18%]' },
  {
    key: 'activity',
    label: 'Last write',
    align: 'left',
    sortKey: VolumeSortKey.LAST_WRITE_AT,
    hideBelow: 'md',
    width: 'w-[116px]',
  },
  { key: 'safety', label: 'Deletion', align: 'left', sortKey: null, hideBelow: 'lg', width: 'w-[104px]' },
  { key: 'open', label: '', align: 'right', sortKey: null, hideBelow: null, width: 'w-[44px]' },
] as const;

const HIDE_CLASS: Record<string, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

function Pager({ page }: { page: PageMeta }) {
  const { setQuery } = useVolumeQuery();
  const from = page.total === 0 ? 0 : page.offset + 1;
  const to = Math.min(page.offset + page.limit, page.total);

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
      <p className="numeric text-xs text-muted-foreground">
        {CountFormat.humanize(from)}–{CountFormat.humanize(to)} of{' '}
        {CountFormat.humanize(page.total)}
      </p>
      <div className="flex gap-1.5">
        <Button
          size="xs"
          variant="outline"
          disabled={page.offset === 0}
          onClick={() => setQuery({ offset: Math.max(0, page.offset - page.limit) })}
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          Previous
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={!page.hasMore}
          onClick={() => setQuery({ offset: page.offset + page.limit })}
        >
          Next
          <ChevronRight className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function VolumeTable({ volumes, page }: { volumes: VolumeSummary[]; page: PageMeta }) {
  const { sort, order, isFiltered, setQuery } = useVolumeQuery();

  if (volumes.length === 0) {
    return (
      <EmptyState
        title={isFiltered ? 'No volumes match these filters' : 'No volumes on this daemon'}
        hint={
          isFiltered
            ? 'Try a broader scope, or clear the name filter.'
            : 'Create one with `docker volume create`, or start a compose project.'
        }
        action={
          isFiltered ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setQuery({ usage: null, search: null, project: null })}
            >
              Clear filters
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <>
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className="border-b border-border">
            {COLUMNS.map((column) => {
              const isSorted = column.sortKey !== null && sort === column.sortKey;
              const nextOrder =
                isSorted && order === SortDirection.DESC ? SortDirection.ASC : SortDirection.DESC;

              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    isSorted
                      ? order === SortDirection.DESC
                        ? 'descending'
                        : 'ascending'
                      : undefined
                  }
                  className={cn(
                    'px-3 py-2 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase first:pl-4 last:pr-4',
                    column.align === 'right' ? 'text-right' : 'text-left',
                    column.width,
                    column.hideBelow ? HIDE_CLASS[column.hideBelow] : null,
                  )}
                >
                  {column.sortKey ? (
                    <button
                      type="button"
                      onClick={() => setQuery({ sort: column.sortKey, order: nextOrder })}
                      className={cn(
                        'inline-flex items-center gap-1 transition-colors hover:text-foreground',
                        isSorted && 'text-foreground',
                      )}
                    >
                      {column.label}
                      <span aria-hidden className="text-[9px]">
                        {isSorted ? (order === SortDirection.DESC ? '▼' : '▲') : ''}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {volumes.map((volume) => (
            <VolumeRow key={volume.name} volume={volume} />
          ))}
        </tbody>
      </table>
      {page.total > page.limit ? <Pager page={page} /> : null}
    </>
  );
}
