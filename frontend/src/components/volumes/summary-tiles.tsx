'use client';

import { ByteFormat, CountFormat } from '@leviosa/shared';
import type { SystemSummary } from '@leviosa/shared';
import { StatTile } from '@/components/ui/stat-tile';

/**
 * Dashboard headline figures.
 *
 * Every total says how complete it is. An unmeasured volume contributes zero bytes, so
 * quoting "measured space" without also quoting how many volumes were never scanned
 * would understate the real footprint — and the reclaimable figure is the one people act
 * on destructively.
 */
export function SummaryTiles({ summary }: { summary: SystemSummary }) {
  const measured = ByteFormat.split(summary.measuredBytes);
  const reclaimable = ByteFormat.split(summary.reclaimableBytes);
  const scanning = summary.queue.running + summary.queue.queued;

  const completeness =
    summary.unmeasuredCount === 0
      ? 'All volumes measured'
      : `${CountFormat.humanize(summary.unmeasuredCount)} not yet measured`;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label="Volumes"
        value={CountFormat.humanize(summary.volumeCount)}
        hint={`${CountFormat.humanize(summary.inUseCount)} in use · ${CountFormat.humanize(summary.reservedCount)} reserved`}
      />
      <StatTile label="Measured space" value={measured.value} unit={measured.unit} hint={completeness} />
      <StatTile
        label="Reclaimable"
        value={reclaimable.value}
        unit={reclaimable.unit}
        tone={summary.reclaimableBytes > 0 ? 'warn' : 'neutral'}
        hint={`Held by ${CountFormat.humanize(summary.orphanedCount)} orphaned volume${summary.orphanedCount === 1 ? '' : 's'}`}
      />
      <StatTile
        label="Orphans"
        value={CountFormat.humanize(summary.orphanedCount)}
        tone={summary.orphanedCount > 0 ? 'danger' : 'ok'}
        hint={
          scanning > 0
            ? `${CountFormat.humanize(scanning)} scan${scanning === 1 ? '' : 's'} in progress`
            : 'No container references them'
        }
      />
    </div>
  );
}
