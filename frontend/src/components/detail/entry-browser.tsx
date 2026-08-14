'use client';

import { useState } from 'react';
import { ChevronRight, CornerLeftUp, File, Folder, Link2 } from 'lucide-react';
import { BrowseDefaults, ByteFormat, EntryKind, TimeFormat } from '@leviosa/shared';
import type { VolumeEntry } from '@leviosa/shared';
import { useHostId, useVolumeEntries } from '@/hooks/index.hooks';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { CopyButton } from '@/components/unlumen-ui/copy';
import { RefreshButton } from '@/components/unlumen-ui/refresh';
import { cn } from '@/lib/utils';

const ICON_BY_KIND = {
  [EntryKind.DIRECTORY]: Folder,
  [EntryKind.FILE]: File,
  [EntryKind.SYMLINK]: Link2,
  [EntryKind.OTHER]: File,
} as const;

/** Skeleton row count for a directory listing; short, since most directories are. */
const BROWSE_SKELETON_ROWS = 5;

function EntryRow({
  entry,
  largestBytes,
  onOpen,
}: {
  entry: VolumeEntry;
  largestBytes: number;
  onOpen: (path: string) => void;
}) {
  const Icon = ICON_BY_KIND[entry.kind];
  const isNavigable = entry.kind === EntryKind.DIRECTORY;
  const share = Math.max(0, Math.min(100, (entry.sizeBytes / largestBytes) * 100));

  return (
    <li className="group relative">
      {/* A size bar bled into the row background turns the listing into a chart without
          spending a column on it — you can see which directory is the problem before
          reading a single number. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0.5 left-0 rounded-sm bg-chart-1/10"
        style={{ width: `${share}%` }}
      />
      <button
        type="button"
        disabled={!isNavigable}
        onClick={() => onOpen(entry.path)}
        className={cn(
          'relative flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors',
          isNavigable ? 'hover:bg-accent' : 'cursor-default',
        )}
      >
        <Icon
          className={cn('size-3.5 shrink-0', isNavigable ? 'text-brand' : 'text-muted-foreground')}
          aria-hidden
        />
        <span className="identifier min-w-0 flex-1 truncate text-xs text-foreground">
          {entry.name}
        </span>
        <span className="numeric shrink-0 text-xs font-medium text-foreground">
          {ByteFormat.humanize(entry.sizeBytes)}
        </span>
        <span className="hidden w-24 shrink-0 text-right text-[11px] text-muted-foreground sm:block">
          {TimeFormat.relative(entry.modifiedAt)}
        </span>
        {isNavigable ? (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
      </button>
    </li>
  );
}

/**
 * Navigable contents of a volume.
 *
 * Each directory is sized recursively, which is what makes this useful for hunting down
 * a runaway 40 GB folder rather than just listing names. Listings are fetched per
 * directory on demand instead of walking the whole tree up front.
 */
export function EntryBrowser({ volumeName }: { volumeName: string }) {
  const hostId = useHostId();
  const [path, setPath] = useState<string>(BrowseDefaults.ROOT_PATH);
  const query = useVolumeEntries(hostId, volumeName, path, true);

  const segments = path === BrowseDefaults.ROOT_PATH ? [] : path.split('/').filter(Boolean);
  const largestBytes = Math.max(...(query.data?.entries ?? []).map((e) => e.sizeBytes), 1);

  return (
    <div className="flex flex-col gap-2.5">
      <nav
        className="flex flex-wrap items-center gap-0.5 rounded-lg bg-muted/50 px-1.5 py-1 text-xs"
        aria-label="Breadcrumb"
      >
        <button
          type="button"
          onClick={() => setPath(BrowseDefaults.ROOT_PATH)}
          className="identifier rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          /
        </button>
        {segments.map((segment, index) => {
          const target = `/${segments.slice(0, index + 1).join('/')}`;
          const isLast = index === segments.length - 1;
          return (
            <span key={target} className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setPath(target)}
                className={cn(
                  'identifier rounded px-1.5 py-0.5',
                  isLast
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {segment}
              </button>
              {isLast ? null : <span className="text-muted-foreground">/</span>}
            </span>
          );
        })}

        <span className="ml-auto flex items-center gap-0.5">
          <CopyButton
            content={path}
            variant="ghost"
            size="xs"
            aria-label="Copy current path"
            className="text-muted-foreground"
          />
          {/* Directory listings are cached per path, so a stale view after a container
              writes is expected; this is the escape hatch, and it spins for exactly as
              long as the refetch takes. */}
          <RefreshButton
            variant="ghost"
            size="icon-xs"
            iconSize={12}
            aria-label="Reload this directory"
            className="text-muted-foreground"
            onRefresh={() => query.refetch().then(() => undefined)}
          />
          {query.data?.parentPath !== null && query.data !== undefined ? (
            <button
              type="button"
              onClick={() => setPath(query.data.parentPath ?? BrowseDefaults.ROOT_PATH)}
              className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <CornerLeftUp className="size-3" aria-hidden />
              Up
            </button>
          ) : null}
        </span>
      </nav>

      {query.isPending ? <TableSkeleton rows={BROWSE_SKELETON_ROWS} /> : null}
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : null}

      {query.data ? (
        query.data.entries.length === 0 ? (
          <EmptyState title="This directory is empty" />
        ) : (
          <>
            <ul className="flex flex-col">
              {query.data.entries.map((entry) => (
                <EntryRow
                  key={entry.path}
                  entry={entry}
                  largestBytes={largestBytes}
                  onOpen={setPath}
                />
              ))}
            </ul>
            {query.data.truncated ? (
              <p className="px-2 text-[11px] text-warn">
                Listing was capped by BROWSE_MAX_ENTRIES; some entries are not shown.
              </p>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}
