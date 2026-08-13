'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Search, X } from 'lucide-react';
import { SortDirection } from '@leviosa/shared';
import type { VolumeSortKey } from '@leviosa/shared';
import { SEARCH_DEBOUNCE_MS, SORT_LABELS, SORT_OPTIONS } from '@/lib/constants';
import { useVolumeQuery } from '@/hooks/index.hooks';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Kbd } from '@/components/unlumen-ui/kbd';

/**
 * Search input.
 *
 * The field is locally controlled and pushed to the URL on a debounce. Writing every
 * keystroke straight to the router would rewrite history, refire the query and drop
 * focus mid-word; keeping the URL authoritative but lagging by a beat gives shareable
 * state without typing through treacle.
 */
function SearchField() {
  const { search, setQuery } = useVolumeQuery();
  const [draft, setDraft] = useState(search);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = useRef(false);

  // Adopt external changes (a scope link, a pasted URL) only while the user is not
  // mid-edit, otherwise the debounce round-trip would fight their cursor.
  useEffect(() => {
    if (!isEditing.current) setDraft(search);
  }, [search]);

  useEffect(() => {
    if (draft === search) return;
    const id = setTimeout(() => {
      isEditing.current = false;
      setQuery({ search: draft || null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [draft, search, setQuery]);

  // `/` is the universal "focus search" key in developer tools; ⌘K is already taken by
  // the palette, which searches across volumes rather than filtering this table.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative flex-1 sm:max-w-64">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(event) => {
          isEditing.current = true;
          setDraft(event.target.value);
        }}
        placeholder="Filter by name"
        aria-label="Filter volumes by name"
        className="h-8 w-full rounded-lg border border-border bg-muted/40 pr-8 pl-8 text-xs text-foreground transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-background focus:outline-none"
      />
      {draft ? (
        <button
          type="button"
          onClick={() => {
            isEditing.current = false;
            setDraft('');
            setQuery({ search: null });
          }}
          aria-label="Clear filter"
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      ) : (
        <Kbd size="sm" className="absolute top-1/2 right-2 -translate-y-1/2">
          /
        </Kbd>
      )}
    </div>
  );
}

/**
 * Sort and filter controls. Every control writes to the URL, so the toolbar, the query
 * cache key and the address bar cannot disagree about what is on screen.
 */
export function FilterBar({ resultLabel }: { resultLabel?: string }) {
  const { sort, order, setQuery } = useVolumeQuery();
  const isDescending = order === SortDirection.DESC;

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
      <SearchField />

      {resultLabel ? (
        <p className="hidden text-xs text-muted-foreground lg:block">{resultLabel}</p>
      ) : null}

      <div className="flex items-center gap-2 sm:ml-auto">
        <Select
          value={sort}
          // `items` is what lets the trigger show "Size" while the URL and the API keep
          // the wire value `size`; without it the raw value leaks into the UI.
          items={SORT_LABELS}
          onValueChange={(value) => setQuery({ sort: value as VolumeSortKey })}
        >
          <SelectTrigger size="sm" className="h-8 w-32 text-xs" aria-label="Sort volumes by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() =>
                  setQuery({ order: isDescending ? SortDirection.ASC : SortDirection.DESC })
                }
                aria-label={isDescending ? 'Sort ascending' : 'Sort descending'}
              >
                {isDescending ? (
                  <ArrowDownWideNarrow className="size-3.5" aria-hidden />
                ) : (
                  <ArrowUpNarrowWide className="size-3.5" aria-hidden />
                )}
              </Button>
            }
          />
          <TooltipContent>{isDescending ? 'Largest first' : 'Smallest first'}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
