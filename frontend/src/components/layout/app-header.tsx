'use client';

import Link from 'next/link';
import { Boxes, CircleAlert, CircleCheck } from 'lucide-react';
import { ScanSourceCopy } from '@/lib/constants';
import { useHealth } from '@/hooks/index.hooks';

/**
 * Daemon indicator.
 *
 * It reports the measurement strategy alongside reachability because that single fact
 * explains most of the tool's observable behaviour: whether a scan spawns a container
 * and takes seconds, or reads the filesystem directly and takes milliseconds.
 */
function DaemonStatus() {
  const { data, isError } = useHealth();

  if (isError || (data && !data.daemon.reachable)) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-danger-soft px-3 py-1 text-xs font-medium text-danger ring-1 ring-inset ring-danger/30">
        <CircleAlert className="size-3.5" aria-hidden />
        Daemon unreachable
      </span>
    );
  }

  if (!data) {
    return <span className="text-xs text-content-faint">Checking daemon…</span>;
  }

  return (
    <span
      title={data.daemon.scanSourceReason}
      className="inline-flex items-center gap-2 rounded-full bg-surface-raised px-3 py-1 text-xs text-content-muted ring-1 ring-inset ring-border-strong"
    >
      <CircleCheck className="size-3.5 text-ok" aria-hidden />
      <span className="font-mono">Docker {data.daemon.version ?? '—'}</span>
      <span className="text-content-faint">·</span>
      <span>{ScanSourceCopy[data.daemon.scanSource]}</span>
    </span>
  );
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border-subtle bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
            <Boxes className="size-4.5" aria-hidden />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">Leviosa</span>
            <span className="text-[11px] text-content-faint">Docker volume insight</span>
          </span>
        </Link>
        <DaemonStatus />
      </div>
    </header>
  );
}
