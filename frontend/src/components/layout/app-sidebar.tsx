'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CircleSlash, HardDrive, Layers, PlayCircle } from 'lucide-react';
import type { ComponentType } from 'react';
import { ByteFormat } from '@leviosa/shared';
import type { SystemSummary } from '@leviosa/shared';
import { Route, SearchParam, VolumeScope } from '@/lib/constants';
import type { VolumeScopeId } from '@/lib/constants';
import { useHostId, useSystemSummary } from '@/hooks/index.hooks';
import { BrandMark } from '@/components/ui/brand-mark';
import { HostSwitcher } from './host-switcher';
import { Highlight, HighlightItem } from '@/components/unlumen-ui/primitives/effects/highlight';
import { ShimmerSkeleton } from '@/components/unlumen-ui/shimmer-skeleton';
import { cn } from '@/lib/utils';

const SCOPE_ICON: Record<VolumeScopeId, ComponentType<{ className?: string }>> = {
  all: Layers,
  'in-use': PlayCircle,
  reserved: HardDrive,
  orphaned: CircleSlash,
};

/** Live counts live in navigation, so the nav answers a question instead of just routing. */
function scopeCount(summary: SystemSummary | undefined, id: VolumeScopeId): number | null {
  if (!summary) return null;
  const counts: Record<VolumeScopeId, number> = {
    all: summary.volumeCount,
    'in-use': summary.inUseCount,
    reserved: summary.reservedCount,
    orphaned: summary.orphanedCount,
  };
  return counts[id];
}

function scopeHref(hostId: string, id: VolumeScopeId): string {
  const scope = VolumeScope.find((entry) => entry.id === id);
  const dashboard = Route.dashboard(hostId);
  return scope?.usage ? `${dashboard}?${SearchParam.USAGE}=${scope.usage}` : dashboard;
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hostId = useHostId();
  const { data: summary } = useSystemSummary(hostId);

  const activeUsage = searchParams.get(SearchParam.USAGE);
  // A volume detail route belongs to no scope: highlighting "All volumes" there would
  // claim a filter is applied when none is.
  const activeId: VolumeScopeId | null =
    pathname === Route.dashboard(hostId)
      ? (VolumeScope.find((scope) => scope.usage === activeUsage)?.id ?? 'all')
      : null;

  return (
    <nav aria-label="Volume scopes" className="px-2.5">
      <p className="px-2.5 pb-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        Inventory
      </p>

      <Highlight
        mode="parent"
        hover
        controlledItems
        containerClassName="flex flex-col gap-0.5"
        className="rounded-lg bg-accent"
      >
        {VolumeScope.map((scope) => {
          const Icon = SCOPE_ICON[scope.id];
          const isActive = activeId === scope.id;
          const count = scopeCount(summary, scope.id);

          return (
            <HighlightItem key={scope.id} value={scope.id} asChild>
              <Link
                href={scopeHref(hostId, scope.id)}
                onClick={onNavigate}
                title={scope.hint}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group relative z-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors',
                  isActive ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {/* Active state is a rail, not a fill: the fill is already spoken for
                    by the hover highlight sliding underneath. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-1.5 bottom-1.5 -left-2.5 w-0.5 rounded-full transition-colors',
                    isActive ? 'bg-brand' : 'bg-transparent',
                  )}
                />
                <Icon
                  className={cn('size-4 shrink-0', isActive ? 'text-brand' : 'text-muted-foreground')}
                />
                <span className="flex-1 truncate">{scope.label}</span>
                {count === null ? (
                  <ShimmerSkeleton className="h-3.5 w-5" />
                ) : (
                  <span className="numeric text-[11px] text-muted-foreground tabular-nums">
                    {count}
                  </span>
                )}
              </Link>
            </HighlightItem>
          );
        })}
      </Highlight>
    </nav>
  );
}

/**
 * The reclaim callout.
 *
 * This is the number the product exists to produce, so it gets the one piece of
 * persistent chrome that is allowed to be loud. It sits at the bottom of the rail
 * rather than the top because it is a conclusion, not a filter.
 */
function ReclaimCallout() {
  const hostId = useHostId();
  const { data: summary } = useSystemSummary(hostId);

  if (!summary) {
    return (
      <div className="mx-2.5 rounded-lg border border-border bg-muted/40 p-3">
        <ShimmerSkeleton className="h-2.5 w-20" />
        <ShimmerSkeleton className="mt-2 h-5 w-24" />
      </div>
    );
  }

  const hasReclaimable = summary.reclaimableBytes > 0;

  return (
    <Link
      href={scopeHref(hostId, 'orphaned')}
      className={cn(
        'mx-2.5 block rounded-lg border p-3 transition-colors',
        hasReclaimable
          ? 'border-ok-line bg-ok-soft hover:border-ok/50'
          : 'border-border bg-muted/40',
      )}
    >
      <p
        className={cn(
          'text-[10px] font-semibold tracking-widest uppercase',
          hasReclaimable ? 'text-ok' : 'text-muted-foreground',
        )}
      >
        Reclaimable
      </p>
      <p
        className={cn(
          'numeric mt-1 text-lg leading-none font-semibold',
          hasReclaimable ? 'text-ok' : 'text-muted-foreground',
        )}
      >
        {ByteFormat.humanize(summary.reclaimableBytes)}
      </p>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
        {hasReclaimable
          ? `Held by ${summary.orphanedCount} orphaned volume${summary.orphanedCount === 1 ? '' : 's'}`
          : 'Nothing to clean up right now'}
      </p>
    </Link>
  );
}

/** Unmeasured volumes make every total on screen a lower bound; say so once, here. */
function CoverageNote() {
  const hostId = useHostId();
  const { data: summary } = useSystemSummary(hostId);

  if (!summary || summary.unmeasuredCount === 0) return null;

  return (
    <p className="px-4 text-[11px] leading-snug text-muted-foreground">
      <span className="text-warn">{summary.unmeasuredCount}</span> volume
      {summary.unmeasuredCount === 1 ? ' has' : 's have'} never been measured, so totals are a
      lower bound.
    </p>
  );
}

export function SidebarBrand() {
  return (
    <Link href={Route.LANDING} className="flex items-center gap-2.5 px-4 py-4">
      <BrandMark />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight">Leviosa</span>
        <span className="truncate text-[11px] text-muted-foreground">Docker volume insight</span>
      </span>
    </Link>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <SidebarBrand />
      {/* Host sits above the scopes because it qualifies all of them: the counts below
          are counts on one machine, and reading them without that context is the whole
          risk multi-host introduces. */}
      <HostSwitcher onNavigate={onNavigate} />
      <div className="flex-1 overflow-y-auto pt-4 pb-4">
        <SidebarNav onNavigate={onNavigate} />
      </div>
      <div className="space-y-3 border-t border-sidebar-border py-4">
        <ReclaimCallout />
        <CoverageNote />
      </div>
    </div>
  );
}
