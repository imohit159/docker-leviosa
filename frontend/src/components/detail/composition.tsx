'use client';

import { ByteFormat, EntryKind } from '@leviosa/shared';
import type { VolumeEntry } from '@leviosa/shared';
import { File, Folder, Link2 } from 'lucide-react';
import { BREAKDOWN_LIMIT } from '@/lib/constants';
import { EmptyState } from '@/components/ui/states';

const ICON_BY_KIND = {
  [EntryKind.DIRECTORY]: Folder,
  [EntryKind.FILE]: File,
  [EntryKind.SYMLINK]: Link2,
  [EntryKind.OTHER]: File,
} as const;

/**
 * Where the space actually went: the largest top-level entries as proportional bars.
 *
 * Bars are scaled against the largest entry rather than the volume total, so a volume
 * dominated by one directory still shows readable bars for the rest instead of a row of
 * invisible slivers.
 */
export function Composition({ entries }: { entries: VolumeEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="No breakdown available"
        hint="Run a scan to record what is inside this volume."
      />
    );
  }

  const shown = entries.slice(0, BREAKDOWN_LIMIT);
  const largest = Math.max(...shown.map((entry) => entry.sizeBytes), 1);
  const hidden = entries.length - shown.length;

  return (
    <div className="flex flex-col gap-3">
      {shown.map((entry) => {
        const Icon = ICON_BY_KIND[entry.kind];
        const width = Math.max(1, (entry.sizeBytes / largest) * 100);

        return (
          <div key={entry.path} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5">
                <Icon className="size-3.5 shrink-0 text-content-faint" aria-hidden />
                <span className="truncate font-mono text-xs text-content-muted">{entry.name}</span>
              </span>
              <span className="numeric shrink-0 text-xs text-content">
                {ByteFormat.humanize(entry.sizeBytes)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full rounded-full bg-accent/70"
                style={{ width: `${String(width)}%` }}
              />
            </div>
          </div>
        );
      })}

      {hidden > 0 ? (
        <p className="text-xs text-content-faint">
          + {hidden} smaller {hidden === 1 ? 'entry' : 'entries'}
        </p>
      ) : null}
    </div>
  );
}
