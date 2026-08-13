'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  PaginationDefaults,
  SortDirection,
  VolumeListDefaults,
  VolumeSortKey,
  VolumeUsage,
} from '@leviosa/shared';
import type { VolumeListQuery } from '@leviosa/shared';
import { SearchParam } from '@/lib/constants';

/** Patch shape callers use; `null` clears a param rather than setting it empty. */
export type VolumeQueryPatch = Partial<{
  usage: VolumeUsage | null;
  search: string | null;
  sort: VolumeSortKey;
  order: SortDirection;
  project: string | null;
  offset: number;
}>;

function _asEnum<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function _asOffset(value: string | null): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : PaginationDefaults.OFFSET;
}

/**
 * The URL is the single source of truth for what the table is showing.
 *
 * Holding filters in component state means a reload silently drops them, the back
 * button skips whole interactions, and "look at this orphan list" is unshareable. It
 * also means two components can disagree about the current filter — which is exactly
 * what happens once the sidebar and the toolbar both want to set `usage`.
 *
 * Everything read out of the query string is validated against the shared enums, so a
 * hand-edited `?sort=lol` degrades to the default instead of reaching the API.
 */
export function useVolumeQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const usage = _asEnum(searchParams.get(SearchParam.USAGE), Object.values(VolumeUsage));
  const search = searchParams.get(SearchParam.SEARCH) ?? '';
  const project = searchParams.get(SearchParam.PROJECT);
  const sort =
    _asEnum(searchParams.get(SearchParam.SORT), Object.values(VolumeSortKey)) ??
    VolumeListDefaults.SORT;
  const order =
    _asEnum(searchParams.get(SearchParam.ORDER), Object.values(SortDirection)) ??
    VolumeListDefaults.ORDER;
  const offset = _asOffset(searchParams.get(SearchParam.OFFSET));

  const query = useMemo<VolumeListQuery>(
    () => ({
      ...(usage ? { usage } : {}),
      ...(search ? { search } : {}),
      ...(project ? { project } : {}),
      sort,
      order,
      limit: PaginationDefaults.LIMIT,
      offset,
    }),
    [usage, search, project, sort, order, offset],
  );

  const setQuery = useCallback(
    (patch: VolumeQueryPatch) => {
      const next = new URLSearchParams(searchParams.toString());

      const write = (key: string, value: string | null | undefined) => {
        if (value === null || value === undefined || value === '') next.delete(key);
        else next.set(key, value);
      };

      if ('usage' in patch) write(SearchParam.USAGE, patch.usage);
      if ('search' in patch) write(SearchParam.SEARCH, patch.search);
      if ('project' in patch) write(SearchParam.PROJECT, patch.project);
      if ('sort' in patch) write(SearchParam.SORT, patch.sort);
      if ('order' in patch) write(SearchParam.ORDER, patch.order);

      // Any change to what is being listed invalidates the page you were on; staying
      // at offset 300 while switching to a four-row filter shows an empty table.
      if ('offset' in patch) {
        write(
          SearchParam.OFFSET,
          patch.offset && patch.offset > 0 ? String(patch.offset) : null,
        );
      } else {
        next.delete(SearchParam.OFFSET);
      }

      const qs = next.toString();
      // `replace`, not `push`: typing in a filter should not build a history stack you
      // have to press Back through ten times to escape.
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const isFiltered = Boolean(usage || search || project);

  return { query, setQuery, usage, search, project, sort, order, offset, isFiltered };
}
