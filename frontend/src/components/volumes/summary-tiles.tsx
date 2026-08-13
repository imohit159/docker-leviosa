'use client';

import { Activity, Database, HardDrive, Sparkles } from 'lucide-react';
import type { SystemSummary } from '@leviosa/shared';
import { StatTile } from '@/components/ui/stat-tile';
import { ByteMetric, CountMetric } from '@/components/ui/metric';

/**
 * The four numbers that decide whether anything else on this page is worth reading.
 *
 * "Measured" is shown next to "Total" rather than folded into it because a size total
 * built from partial coverage is a lie of omission — the gap between the two is the
 * honest error bar on every other figure here.
 */
export function SummaryTiles({ summary }: { summary: SystemSummary }) {
  const measuredCount = summary.volumeCount - summary.unmeasuredCount;
  const isScanning = summary.queue.running > 0 || summary.queue.queued > 0;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatTile
        label="Volumes"
        icon={<Database className="size-3.5" aria-hidden />}
        value={<CountMetric value={summary.volumeCount} />}
        hint={`${summary.inUseCount} in use · ${summary.reservedCount} reserved`}
      />

      <StatTile
        label="Measured size"
        icon={<HardDrive className="size-3.5" aria-hidden />}
        value={<ByteMetric bytes={summary.measuredBytes} />}
        hint={
          summary.unmeasuredCount > 0
            ? `${measuredCount} of ${summary.volumeCount} volumes measured`
            : 'All volumes measured'
        }
      />

      <StatTile
        label="Orphaned"
        icon={<Sparkles className="size-3.5" aria-hidden />}
        tone={summary.orphanedCount > 0 ? 'warn' : 'neutral'}
        value={<CountMetric value={summary.orphanedCount} />}
        hint="No container references these"
      />

      <StatTile
        label="Reclaimable"
        icon={<Activity className="size-3.5" aria-hidden />}
        tone={summary.reclaimableBytes > 0 ? 'ok' : 'neutral'}
        value={<ByteMetric bytes={summary.reclaimableBytes} />}
        hint={
          isScanning
            ? `Measuring — ${summary.queue.running} running, ${summary.queue.queued} queued`
            : 'Cached bytes held by orphans'
        }
      />
    </div>
  );
}
