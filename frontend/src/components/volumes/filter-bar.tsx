'use client';

import { ArrowDownWideNarrow, ArrowUpNarrowWide, Search } from 'lucide-react';
import { SortDirection, VolumeUsage } from '@leviosa/shared';
import type { VolumeListQuery, VolumeSortKey } from '@leviosa/shared';
import { SORT_OPTIONS, UsageCopy } from '@/lib/constants';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';

const USAGE_FILTERS: ReadonlyArray<VolumeUsage | 'ALL'> = [
  'ALL',
  VolumeUsage.IN_USE,
  VolumeUsage.RESERVED,
  VolumeUsage.ORPHANED,
];

/**
 * Filter and sort controls.
 *
 * Every control writes to the same query object that becomes the request's query string,
 * so the URL contract, the cache key and this toolbar cannot disagree about what is being
 * displayed.
 */
export function FilterBar({
  query,
  onChange,
}: {
  query: VolumeListQuery;
  onChange: (next: VolumeListQuery) => void;
}) {
  const activeUsage = query.usage ?? 'ALL';

  const setUsage = (value: VolumeUsage | 'ALL') => {
    // Filter changes reset the window: page 3 of the old result set is meaningless.
    onChange({ ...query, usage: value === 'ALL' ? undefined : value, offset: 0 });
  };

  const toggleOrder = () => {
    onChange({
      ...query,
      order: query.order === SortDirection.DESC ? SortDirection.ASC : SortDirection.DESC,
    });
  };

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-1.5">
        {USAGE_FILTERS.map((value) => {
          const isActive = activeUsage === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setUsage(value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-surface-raised text-content ring-1 ring-inset ring-border-strong'
                  : 'text-content-faint hover:bg-surface hover:text-content-muted',
              )}
            >
              {value === 'ALL' ? 'All' : UsageCopy[value].label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-content-faint"
            aria-hidden
          />
          <input
            type="search"
            value={query.search ?? ''}
            onChange={(event) => onChange({ ...query, search: event.target.value, offset: 0 })}
            placeholder="Filter by name"
            aria-label="Filter volumes by name"
            className="h-8 w-44 rounded-md border border-border-subtle bg-surface pr-3 pl-8 text-xs text-content placeholder:text-content-faint focus:border-accent focus:outline-none"
          />
        </div>

        <select
          value={query.sort}
          onChange={(event) => onChange({ ...query, sort: event.target.value as VolumeSortKey })}
          aria-label="Sort volumes by"
          className="h-8 rounded-md border border-border-subtle bg-surface px-2 text-xs text-content focus:border-accent focus:outline-none"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <Button
          size="sm"
          variant="ghost"
          onClick={toggleOrder}
          aria-label={query.order === SortDirection.DESC ? 'Sort ascending' : 'Sort descending'}
        >
          {query.order === SortDirection.DESC ? (
            <ArrowDownWideNarrow className="size-3.5" aria-hidden />
          ) : (
            <ArrowUpNarrowWide className="size-3.5" aria-hidden />
          )}
        </Button>
      </div>
    </div>
  );
}
