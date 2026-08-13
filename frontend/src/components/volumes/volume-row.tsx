'use client';

import Link from 'next/link';
import { ChevronRight, Gauge, ShieldAlert, ShieldCheck } from 'lucide-react';
import { ByteFormat, MeasurementFreshness, TimeFormat } from '@leviosa/shared';
import type { VolumeSummary } from '@leviosa/shared';
import { FreshnessCopy, VerdictCopy } from '@/lib/constants';
import { useScan } from '@/hooks/index.hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UsageBadge } from './usage-badge';

/** Consumer summary: the first name, plus a count for the rest. */
function ConsumerCell({ volume }: { volume: VolumeSummary }) {
  const [first, ...rest] = volume.usage.consumers;

  if (!first) {
    return <span className="text-xs text-content-faint">No containers</span>;
  }

  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className="truncate font-mono text-content-muted" title={first.mountPath}>
        {first.containerName}
      </span>
      {rest.length > 0 ? (
        <span className="numeric shrink-0 text-content-faint">+{rest.length}</span>
      ) : null}
    </span>
  );
}

/**
 * Size cell.
 *
 * An unmeasured volume offers the measurement rather than showing a zero, because "0 B"
 * and "not measured yet" lead to opposite decisions. Stale figures are shown with a
 * marker instead of being hidden: a six-hour-old size still answers "which of these is
 * the big one?".
 */
function SizeCell({ volume }: { volume: VolumeSummary }) {
  const scan = useScan(volume.name);

  if (!volume.size) {
    return (
      <Button
        size="sm"
        variant="ghost"
        loading={scan.isRunning}
        onClick={scan.start}
        title="Measure this volume"
      >
        {scan.isRunning ? 'Measuring' : 'Measure'}
      </Button>
    );
  }

  const { value, unit } = ByteFormat.split(volume.size.totalBytes);
  const isStale = volume.freshness === MeasurementFreshness.STALE;

  return (
    <span className="flex items-baseline justify-end gap-1" title={FreshnessCopy[volume.freshness]}>
      <span className="numeric text-sm font-medium text-content">{value}</span>
      <span className="text-xs text-content-muted">{unit}</span>
      {isStale ? <span className="ml-1 size-1.5 rounded-full bg-warn" aria-hidden /> : null}
    </span>
  );
}

export function VolumeRow({ volume }: { volume: VolumeSummary }) {
  const safe = volume.safety.deletable;

  return (
    <tr className="group border-b border-border-subtle transition-colors last:border-0 hover:bg-surface-hover">
      <td className="max-w-0 py-3 pl-5">
        <Link href={`/volumes/${encodeURIComponent(volume.name)}`} className="block min-w-0">
          <span className="block truncate font-mono text-sm text-content group-hover:text-accent">
            {volume.name}
          </span>
          {volume.composeProject ? (
            <span className="mt-0.5 block truncate text-[11px] text-content-faint">
              compose · {volume.composeProject}
            </span>
          ) : null}
        </Link>
      </td>

      <td className="px-3 py-3">
        <UsageBadge usage={volume.usage} />
      </td>

      <td className="px-3 py-3 text-right whitespace-nowrap">
        <SizeCell volume={volume} />
      </td>

      <td className="max-w-40 px-3 py-3">
        <ConsumerCell volume={volume} />
      </td>

      <td className="px-3 py-3 text-xs whitespace-nowrap text-content-faint">
        {volume.size ? (
          <span title={TimeFormat.absolute(volume.size.lastWriteAt)}>
            {TimeFormat.relative(volume.size.lastWriteAt)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Gauge className="size-3" aria-hidden />
            unknown
          </span>
        )}
      </td>

      <td className="px-3 py-3">
        <Badge tone={safe ? 'ok' : 'neutral'} title={volume.safety.reason}>
          {safe ? (
            <ShieldCheck className="size-3" aria-hidden />
          ) : (
            <ShieldAlert className="size-3" aria-hidden />
          )}
          {safe ? 'Safe' : 'Blocked'}
        </Badge>
      </td>

      <td className="py-3 pr-5 text-right">
        <Link
          href={`/volumes/${encodeURIComponent(volume.name)}`}
          className="inline-flex items-center text-content-faint transition-colors hover:text-accent"
          aria-label={`Open ${volume.name}`}
          title={VerdictCopy[volume.safety.verdict]}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </td>
    </tr>
  );
}
