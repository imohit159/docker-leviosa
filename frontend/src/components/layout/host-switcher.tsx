'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Cloud, Server, Settings2 } from 'lucide-react';
import { HostKind } from '@leviosa/shared';
import { Route } from '@/lib/constants';
import { useHostId, useHostsWithStatus } from '@/hooks/index.hooks';
import type { HostWithStatus } from '@/hooks/use-hosts';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { ShimmerSkeleton } from '@/components/unlumen-ui/shimmer-skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** A dot rather than a word: the switcher is chrome, and four rows of text is a list. */
function ReachabilityDot({ host }: { host: HostWithStatus }) {
  const tone = !host.enabled ? 'bg-muted-foreground/40' : host.reachable ? 'bg-ok' : 'bg-danger';
  const label = !host.enabled ? 'Disabled' : host.reachable ? 'Reachable' : 'Unreachable';

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="relative flex size-2 shrink-0 items-center justify-center">
            {/* Only a healthy host pulses. A dead one holding still is the point. */}
            {host.reachable && host.enabled ? (
              <span className={cn('absolute size-2 animate-ping rounded-full opacity-60', tone)} />
            ) : null}
            <span className={cn('relative size-2 rounded-full', tone)} aria-label={label} />
          </span>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Switches which daemon the dashboard is reading.
 *
 * Changing host is a navigation, not a stored setting: it rewrites the URL so the
 * address bar always names the machine on screen. Anything else and a shared link would
 * open on whichever host the recipient last looked at — a genuinely dangerous property
 * for a page whose primary action is deletion.
 *
 * Unreachable hosts stay selectable rather than being disabled. You need to open a
 * broken host to find out why it is broken, and a switcher that hides exactly the host
 * you are trying to debug is worse than useless.
 */
export function HostSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const hostId = useHostId();
  const { hosts, isLoading } = useHostsWithStatus();

  const current = hosts.find((host) => host.id === hostId) ?? null;

  if (isLoading && hosts.length === 0) {
    return <ShimmerSkeleton className="mx-2.5 h-9" rounded="lg" />;
  }

  return (
    <div className="px-2.5">
      <p className="px-2.5 pb-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        Host
      </p>

      <Select
        value={hostId}
        onValueChange={(next: string | null) => {
          // Base UI clears to null on deselect. There is always a host in view, so
          // clearing is not a state this control can be in.
          if (next === null || next === hostId) {
            return;
          }
          onNavigate?.();
          router.push(Route.dashboard(next));
        }}
      >
        <SelectTrigger className="h-9 w-full bg-card" aria-label="Switch Docker host">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {current ? <ReachabilityDot host={current} /> : null}
            <span className="truncate text-[13px]">{current?.label ?? hostId}</span>
          </span>
        </SelectTrigger>

        <SelectContent align="start" className="min-w-[var(--anchor-width)]">
          {hosts.map((host) => {
            const Icon = host.kind === HostKind.SSH ? Cloud : Server;
            return (
              <SelectItem key={host.id} value={host.id}>
                <span className="flex min-w-0 items-center gap-2">
                  <ReachabilityDot host={host} />
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 truncate">{host.label}</span>
                  {host.kind === HostKind.SSH && host.ssh ? (
                    <span className="identifier shrink-0 text-[10px] text-muted-foreground">
                      {host.ssh.host}
                    </span>
                  ) : null}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <Link
        href={Route.SETTINGS}
        onClick={onNavigate}
        className="mt-1.5 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Settings2 className="size-3" aria-hidden />
        Manage hosts
      </Link>
    </div>
  );
}
