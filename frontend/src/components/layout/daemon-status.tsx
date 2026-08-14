'use client';

import { ScanSourceCopy } from '@/lib/constants';
import { useHealth, useHostId } from '@/hooks/index.hooks';
import { GlowingBadge } from '@/components/unlumen-ui/glowing-badge';
import { ShimmerSkeleton } from '@/components/unlumen-ui/shimmer-skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Daemon indicator for the host currently on screen.
 *
 * It reports the measurement strategy alongside reachability because that single fact
 * explains most of the tool's observable behaviour: whether a scan spawns a container
 * and takes seconds, or reads the filesystem directly and takes milliseconds. The
 * detail moves into a tooltip so the always-visible chrome stays one glanceable chip.
 *
 * It deliberately reports this host rather than an aggregate. A green chip while the
 * VPS you are actually looking at is down would be worse than no chip at all, and an
 * aggregate that goes red because some unrelated host is unreachable trains people to
 * ignore it.
 */
export function DaemonStatus() {
  const hostId = useHostId();
  const { data, isError } = useHealth();

  const report = data?.hosts.find((entry) => entry.hostId === hostId) ?? null;

  if (isError) {
    return (
      <GlowingBadge variant="error" pulse={false}>
        API unreachable
      </GlowingBadge>
    );
  }

  if (!data) {
    return <ShimmerSkeleton className="h-6 w-32" rounded="full" />;
  }

  if (!report || !report.reachable) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span>
              <GlowingBadge variant="error" pulse={false}>
                {report?.label ?? 'Host'} unreachable
              </GlowingBadge>
            </span>
          }
        />
        <TooltipContent className="block max-w-xs leading-relaxed">
          {report
            ? `Leviosa could not reach the Docker daemon on ${report.label}. Volume data on this page is unavailable until it responds.`
            : 'This host is no longer registered.'}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span>
            {/* The pulse is load-bearing: it is the only signal that the health poll is
                still alive, which is exactly what you check when numbers look wrong. */}
            <GlowingBadge variant="success">
              <span className="identifier">Docker {report.version ?? '—'}</span>
            </GlowingBadge>
          </span>
        }
      />
      <TooltipContent className="block max-w-xs leading-relaxed">
        <p className="font-medium">{report.label}</p>
        <p className="mt-1">{ScanSourceCopy[report.scanSource]}</p>
        <p className="mt-1 text-background/70">{report.scanSourceReason}</p>
        {report.operatingSystem ? (
          <p className="mt-1 text-background/70">{report.operatingSystem}</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
