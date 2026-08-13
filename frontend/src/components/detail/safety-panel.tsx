'use client';

import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { ByteFormat, TimeFormat } from '@leviosa/shared';
import type { VolumeDetail } from '@leviosa/shared';
import { VerdictCopy } from '@/lib/constants';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { DeleteDialog } from './delete-dialog';

/**
 * The safe-to-delete verdict, its justification, and the destructive control.
 *
 * When deletion is blocked, the button is disabled rather than hidden and the specific
 * blocking containers are named. A disabled control with a reason teaches what to do
 * next; a missing control just looks broken.
 */
export function SafetyPanel({ volume }: { volume: VolumeDetail }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const safe = volume.safety.deletable;
  const sighting = volume.sighting;

  return (
    <div
      className={cn(
        'rounded-xl border px-5 py-4',
        safe ? 'border-ok/30 bg-ok-soft/40' : 'border-border-strong bg-surface',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-lg',
              safe ? 'bg-ok-soft text-ok' : 'bg-surface-raised text-content-muted',
            )}
          >
            {safe ? (
              <ShieldCheck className="size-4.5" aria-hidden />
            ) : (
              <ShieldAlert className="size-4.5" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <p className={cn('text-sm font-semibold', safe ? 'text-ok' : 'text-content')}>
              {VerdictCopy[volume.safety.verdict]}
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-content-muted">
              {volume.safety.reason}
            </p>
          </div>
        </div>

        <Button
          variant="danger"
          disabled={!safe}
          title={safe ? 'Delete this volume' : volume.safety.reason}
          onClick={() => setDialogOpen(true)}
        >
          <Trash2 className="size-3.5" aria-hidden />
          Delete
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 border-t border-border-subtle pt-3 text-xs sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="text-content-faint">Reclaimable</dt>
          <dd className="numeric text-content-muted">
            {volume.safety.reclaimableBytes === null
              ? 'unknown — never measured'
              : ByteFormat.humanize(volume.safety.reclaimableBytes)}
          </dd>
        </div>

        {/* Docker records no last-use timestamp, so this figure is only as old as this
            tool's own observation ledger. The UI says so rather than implying otherwise. */}
        <div className="flex justify-between gap-3">
          <dt className="text-content-faint">Last seen attached</dt>
          <dd className="text-content-muted">
            {sighting === null
              ? 'not tracked yet'
              : sighting.lastSeenAttachedAt === null
                ? `never, since tracking began ${TimeFormat.relative(sighting.firstSeenAt)}`
                : `${TimeFormat.relative(sighting.lastSeenAttachedAt)}${
                    sighting.trackingReliable ? '' : ' (tracking started recently)'
                  }`}
          </dd>
        </div>
      </dl>

      {dialogOpen ? (
        <DeleteDialog
          volumeName={volume.name}
          safety={volume.safety}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </div>
  );
}
