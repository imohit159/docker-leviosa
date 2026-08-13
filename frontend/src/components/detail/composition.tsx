'use client';

import { motion } from 'motion/react';
import { ByteFormat, EntryKind } from '@leviosa/shared';
import type { VolumeEntry } from '@leviosa/shared';
import { File, Folder, Link2 } from 'lucide-react';
import { BREAKDOWN_LIMIT, Motion } from '@/lib/constants';
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
 * invisible slivers. The share-of-total percentage is printed separately, because that
 * is the number the bar length can no longer be trusted to communicate.
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
  const total = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0) || 1;
  const hidden = entries.length - shown.length;

  return (
    <div className="flex flex-col gap-2.5">
      {shown.map((entry, index) => {
        const Icon = ICON_BY_KIND[entry.kind];
        const width = Math.max(1, (entry.sizeBytes / largest) * 100);
        const share = Math.round((entry.sizeBytes / total) * 100);

        return (
          <div key={entry.path} className="group flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="identifier truncate text-xs text-foreground">{entry.name}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="numeric text-[11px] text-muted-foreground">{share}%</span>
                <span className="numeric text-xs font-medium text-foreground">
                  {ByteFormat.humanize(entry.sizeBytes)}
                </span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              {/* Bars grow from zero once, on the data that produced them: the sweep is
                  what makes the relative lengths land as a comparison rather than a
                  static list of numbers you have to read one at a time. */}
              <motion.div
                className="h-full rounded-full bg-chart-1"
                initial={{ width: 0 }}
                animate={{ width: `${width}%` }}
                transition={{ ...Motion.SPRING, delay: index * 0.03 }}
              />
            </div>
          </div>
        );
      })}

      {hidden > 0 ? (
        <p className="pt-0.5 text-[11px] text-muted-foreground">
          + {hidden} smaller {hidden === 1 ? 'entry' : 'entries'}
        </p>
      ) : null}
    </div>
  );
}
