'use client';

import { useState } from 'react';
import { ChevronRight, CornerLeftUp, File, Folder, Link2 } from 'lucide-react';
import { BrowseDefaults, ByteFormat, EntryKind, TimeFormat } from '@leviosa/shared';
import type { VolumeEntry } from '@leviosa/shared';
import { useVolumeEntries } from '@/hooks/index.hooks';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';

const ICON_BY_KIND = {
  [EntryKind.DIRECTORY]: Folder,
  [EntryKind.FILE]: File,
  [EntryKind.SYMLINK]: Link2,
  [EntryKind.OTHER]: File,
} as const;

function EntryRow({ entry, onOpen }: { entry: VolumeEntry; onOpen: (path: string) => void }) {
  const Icon = ICON_BY_KIND[entry.kind];
  const isNavigable = entry.kind === EntryKind.DIRECTORY;

  return (
    <li>
      <button
        type="button"
        disabled={!isNavigable}
        onClick={() => onOpen(entry.path)}
        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors enabled:hover:bg-surface-hover disabled:cursor-default"
      >
        <Icon
          className={`size-3.5 shrink-0 ${isNavigable ? 'text-accent' : 'text-content-faint'}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-content-muted">
          {entry.name}
        </span>
        <span className="numeric shrink-0 text-xs text-content">
          {ByteFormat.humanize(entry.sizeBytes)}
        </span>
        <span className="hidden w-28 shrink-0 text-right text-[11px] text-content-faint sm:block">
          {TimeFormat.relative(entry.modifiedAt)}
        </span>
        {isNavigable ? (
          <ChevronRight className="size-3.5 shrink-0 text-content-faint" aria-hidden />
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
  const [path, setPath] = useState<string>(BrowseDefaults.ROOT_PATH);
  const query = useVolumeEntries(volumeName, path, true);

  const segments = path === BrowseDefaults.ROOT_PATH ? [] : path.split('/').filter(Boolean);

  return (
    <div className="flex flex-col gap-3">
      <nav className="flex flex-wrap items-center gap-1 text-xs" aria-label="Breadcrumb">
        <button
          type="button"
          onClick={() => setPath(BrowseDefaults.ROOT_PATH)}
          className="rounded px-1.5 py-0.5 font-mono text-content-faint hover:bg-surface-raised hover:text-content"
        >
          /
        </button>
        {segments.map((segment, index) => {
          const target = `/${segments.slice(0, index + 1).join('/')}`;
          const isLast = index === segments.length - 1;
          return (
            <span key={target} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPath(target)}
                className={`rounded px-1.5 py-0.5 font-mono ${
                  isLast ? 'text-content' : 'text-content-faint hover:bg-surface-raised hover:text-content'
                }`}
              >
                {segment}
              </button>
              {isLast ? null : <span className="text-content-faint">/</span>}
            </span>
          );
        })}

        {query.data?.parentPath !== null && query.data !== undefined ? (
          <button
            type="button"
            onClick={() => setPath(query.data.parentPath ?? BrowseDefaults.ROOT_PATH)}
            className="ml-auto inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-content-faint hover:bg-surface-raised hover:text-content"
          >
            <CornerLeftUp className="size-3" aria-hidden />
            Up
          </button>
        ) : null}
      </nav>

      {query.isPending ? <LoadingState label="Reading directory" /> : null}
      {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}

      {query.data ? (
        query.data.entries.length === 0 ? (
          <EmptyState title="This directory is empty" />
        ) : (
          <>
            <ul className="flex flex-col">
              {query.data.entries.map((entry) => (
                <EntryRow key={entry.path} entry={entry} onOpen={setPath} />
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
