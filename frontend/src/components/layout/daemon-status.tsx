'use client';

import { ScanSourceCopy } from '@/lib/constants';
import { useHealth } from '@/hooks/index.hooks';
import { GlowingBadge } from '@/components/unlumen-ui/glowing-badge';
import { ShimmerSkeleton } from '@/components/unlumen-ui/shimmer-skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Daemon indicator.
 *
 * It reports the measurement strategy alongside reachability because that single fact
 * explains most of the tool's observable behaviour: whether a scan spawns a container
 * and takes seconds, or reads the filesystem directly and takes milliseconds. The
 * detail moves into a tooltip so the always-visible chrome stays one glanceable chip.
 */
export function DaemonStatus() {
  const { data, isError } = useHealth();

  if (isError || (data && !data.daemon.reachable)) {
    return (
      <GlowingBadge variant="error" pulse={false}>
        Daemon unreachable
      </GlowingBadge>
    );
  }

  if (!data) {
    return <ShimmerSkeleton className="h-6 w-32" rounded="full" />;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span>
            {/* The pulse is load-bearing: it is the only signal that the health poll is
                still alive, which is exactly what you check when numbers look wrong. */}
            <GlowingBadge variant="success">
              <span className="identifier">Docker {data.daemon.version ?? '—'}</span>
            </GlowingBadge>
          </span>
        }
      />
      <TooltipContent className="block max-w-xs leading-relaxed">
        <p className="font-medium">{ScanSourceCopy[data.daemon.scanSource]}</p>
        <p className="mt-1 text-background/70">{data.daemon.scanSourceReason}</p>
        {data.daemon.operatingSystem ? (
          <p className="mt-1 text-background/70">{data.daemon.operatingSystem}</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
