'use client';

import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { TimeFormat } from '@leviosa/shared';
import type { VolumeDetail } from '@leviosa/shared';
import { VerdictCopy } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ByteMetric } from '@/components/ui/metric';
import { DeleteDialog } from './delete-dialog';

/** Docker records no last-use timestamp, so this figure is only as old as our ledger. */
function lastSeenLabel(sighting: VolumeDetail['sighting']): string {
  if (sighting === null) return 'not tracked yet';
  if (sighting.lastSeenAttachedAt === null) {
    return `never, since tracking began ${TimeFormat.relative(sighting.firstSeenAt)}`;
  }
  return `${TimeFormat.relative(sighting.lastSeenAttachedAt)}${
    sighting.trackingReliable ? '' : ' (tracking started recently)'
  }`;
}

/**
 * The safe-to-delete verdict, its justification, and the destructive control.
 *
 * This is the answer the page exists to give, so it sits above the panels rather than
 * inside one, and it is the only element on the detail view allowed a tinted surface.
 *
 * When deletion is blocked, the button is disabled rather than hidden and the specific
 * reason is named. A disabled control with a reason teaches what to do next; a missing
 * control just looks broken.
 */
export function SafetyPanel({ volume }: { volume: VolumeDetail }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const safe = volume.safety.deletable;

  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3.5',
        safe ? 'border-ok-line bg-ok-soft/50' : 'border-border bg-card',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-lg',
              safe ? 'bg-ok-soft text-ok' : 'bg-muted text-muted-foreground',
            )}
          >
            {safe ? (
              <ShieldCheck className="size-4.5" aria-hidden />
            ) : (
              <ShieldAlert className="size-4.5" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <p className={cn('text-sm font-semibold', safe ? 'text-ok' : 'text-foreground')}>
              {VerdictCopy[volume.safety.verdict]}
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {volume.safety.reason}
            </p>
          </div>
        </div>

        <Button
          variant="destructive"
          disabled={!safe}
          title={safe ? 'Delete this volume' : volume.safety.reason}
          onClick={() => setDialogOpen(true)}
        >
          <Trash2 className="size-3.5" aria-hidden />
          Delete
        </Button>
      </div>

      <dl className="mt-3.5 grid grid-cols-1 gap-x-8 gap-y-2 border-t border-border pt-3 text-xs sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Reclaimable</dt>
          <dd className="numeric text-foreground">
            {volume.safety.reclaimableBytes === null ? (
              <span className="text-muted-foreground">unknown — never measured</span>
            ) : (
              <ByteMetric bytes={volume.safety.reclaimableBytes} />
            )}
          </dd>
        </div>

        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-muted-foreground">Last seen attached</dt>
          <dd className="text-right text-foreground">{lastSeenLabel(volume.sighting)}</dd>
        </div>
      </dl>

      <DeleteDialog
        volumeName={volume.name}
        safety={volume.safety}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
