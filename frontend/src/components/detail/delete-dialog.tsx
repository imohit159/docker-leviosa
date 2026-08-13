'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ByteFormat } from '@leviosa/shared';
import type { DeleteSafety } from '@leviosa/shared';
import { AlertTriangle } from 'lucide-react';
import { useDeleteVolume } from '@/hooks/index.hooks';
import { Button } from '@/components/ui/button';

/**
 * Typed-confirmation dialog.
 *
 * The user must retype the volume name. This is not ceremony: the destructive control
 * sits next to a size figure that may be tens of gigabytes, the action is irreversible,
 * and Docker offers no undo or trash. Retyping is the cheapest available defence against
 * deleting the row above the one you meant.
 */
export function DeleteDialog({
  volumeName,
  safety,
  onClose,
}: {
  volumeName: string;
  safety: DeleteSafety;
  onClose: () => void;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const mutation = useDeleteVolume(() => {
    router.push('/');
  });

  const matches = typed === volumeName;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-canvas/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        className="w-full max-w-md rounded-xl border border-border-strong bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger">
            <AlertTriangle className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="delete-dialog-title" className="text-sm font-semibold text-content">
              Delete this volume permanently
            </h2>
            <p className="mt-1 text-xs text-content-muted">
              {safety.reclaimableBytes === null
                ? 'This volume has never been measured, so the amount of data about to be destroyed is unknown.'
                : `${ByteFormat.humanize(safety.reclaimableBytes)} of data will be destroyed. Docker has no undo for this.`}
            </p>
          </div>
        </div>

        <label htmlFor="confirm-name" className="mt-5 block text-xs text-content-muted">
          Type <span className="font-mono text-content">{volumeName}</span> to confirm
        </label>
        <input
          id="confirm-name"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className="mt-1.5 h-9 w-full rounded-md border border-border-strong bg-surface-raised px-3 font-mono text-sm text-content focus:border-danger focus:outline-none"
        />

        {mutation.isError ? (
          <p className="mt-3 text-xs text-danger">{mutation.error.message}</p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!matches}
            loading={mutation.isPending}
            onClick={() => mutation.mutate({ name: volumeName, confirm: typed })}
          >
            Delete volume
          </Button>
        </div>
      </div>
    </div>
  );
}
