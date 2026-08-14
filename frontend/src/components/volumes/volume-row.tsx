'use client';

import { useRouter } from 'next/navigation';
import type { KeyboardEvent, MouseEvent } from 'react';
import { ChevronRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import { MeasurementFreshness, TimeFormat } from '@leviosa/shared';
import type { VolumeSummary } from '@leviosa/shared';
import { FreshnessCopy, Route, VerdictCopy } from '@/lib/constants';
import { useScan } from '@/hooks/index.hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ByteMetric } from '@/components/ui/metric';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CopyButton } from '@/components/unlumen-ui/copy';
import { UsageBadge } from './usage-badge';

/** Nested controls (Measure, Copy) must not also trigger row navigation. */
function stopRowNavigation(event: MouseEvent) {
  event.stopPropagation();
}

/** Consumer summary: the first name inline, the full list in a tooltip. */
function ConsumerCell({ volume }: { volume: VolumeSummary }) {
  const [first, ...rest] = volume.usage.consumers;

  if (!first) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="flex cursor-default items-center gap-1.5 text-xs">
            <span className="identifier truncate text-muted-foreground">
              {first.containerName}
            </span>
            {rest.length > 0 ? (
              <span className="numeric shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                +{rest.length}
              </span>
            ) : null}
          </span>
        }
      />
      <TooltipContent className="block">
        <ul className="space-y-1">
          {volume.usage.consumers.map((consumer) => (
            <li key={consumer.containerId} className="flex items-center gap-2">
              <span
                className={`size-1.5 shrink-0 rounded-full ${consumer.live ? 'bg-ok' : 'bg-background/40'}`}
                aria-hidden
              />
              <span className="font-mono">{consumer.containerName}</span>
              <span className="text-background/60">{consumer.mountPath}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
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
  // The row's own payload names its host, so the cell never has to guess from the URL.
  const scan = useScan(volume.hostId, volume.name);

  if (!volume.size) {
    return (
      <Button
        size="xs"
        variant="outline"
        loading={scan.isRunning}
        onClick={(event) => {
          stopRowNavigation(event);
          scan.start();
        }}
        title="Measure this volume"
      >
        {scan.isRunning ? 'Measuring' : 'Measure'}
      </Button>
    );
  }

  const isStale = volume.freshness === MeasurementFreshness.STALE;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex cursor-default items-center justify-end gap-1.5">
            <ByteMetric
              bytes={volume.size.totalBytes}
              className="text-sm font-medium text-foreground"
            />
            {isStale ? <span className="size-1.5 rounded-full bg-warn" aria-hidden /> : null}
          </span>
        }
      />
      <TooltipContent>{FreshnessCopy[volume.freshness]}</TooltipContent>
    </Tooltip>
  );
}

export function VolumeRow({ volume }: { volume: VolumeSummary }) {
  const router = useRouter();
  const safe = volume.safety.deletable;
  const href = Route.volume(volume.hostId, volume.name);

  const open = () => {
    router.push(href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  };

  return (
    <tr
      role="link"
      tabIndex={0}
      aria-label={`Open ${volume.name}`}
      title={VerdictCopy[volume.safety.verdict]}
      onClick={open}
      onKeyDown={onKeyDown}
      className="group cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
    >
      <td className="max-w-0 py-2.5 pl-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <span className="identifier block truncate text-[13px] text-foreground transition-colors group-hover:text-brand">
              {volume.name}
            </span>
            {volume.composeProject ? (
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                compose · {volume.composeProject}
              </span>
            ) : null}
          </div>
          {/* Reveal-on-hover: you almost always want this name in a docker command
              next, and a permanently visible icon per row would be visual static. */}
          <CopyButton
            content={volume.name}
            variant="ghost"
            size="xs"
            aria-label={`Copy ${volume.name}`}
            onClick={stopRowNavigation}
            className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          />
        </div>
      </td>

      <td className="px-3 py-2.5">
        <UsageBadge usage={volume.usage} />
      </td>

      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <SizeCell volume={volume} />
      </td>

      <td className="hidden max-w-40 px-3 py-2.5 sm:table-cell">
        <ConsumerCell volume={volume} />
      </td>

      <td className="hidden px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground md:table-cell">
        <span title={TimeFormat.absolute(volume.size?.lastWriteAt)}>
          {volume.size ? TimeFormat.relative(volume.size.lastWriteAt) : 'unknown'}
        </span>
      </td>

      <td className="hidden px-3 py-2.5 lg:table-cell">
        <Badge tone={safe ? 'ok' : 'neutral'} title={volume.safety.reason}>
          {safe ? (
            <ShieldCheck className="size-3" aria-hidden />
          ) : (
            <ShieldAlert className="size-3" aria-hidden />
          )}
          {safe ? 'Safe' : 'Blocked'}
        </Badge>
      </td>

      <td className="py-2.5 pr-4 text-right">
        <span className="inline-flex items-center text-muted-foreground transition-colors group-hover:text-brand">
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </td>
    </tr>
  );
}
