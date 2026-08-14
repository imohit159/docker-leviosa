'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ByteFormat } from '@leviosa/shared';
import type { DeleteSafety } from '@leviosa/shared';
import { TriangleAlert } from 'lucide-react';
import { Route } from '@/lib/constants';
import { useDeleteVolume, useHostId } from '@/hooks/index.hooks';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

/**
 * Typed-confirmation dialog.
 *
 * The user must retype the volume name. This is not ceremony: the destructive control
 * sits next to a size figure that may be tens of gigabytes, the action is irreversible,
 * and Docker offers no undo or trash. Retyping is the cheapest available defence against
 * deleting the row above the one you meant.
 *
 * Built on the dialog primitive rather than a hand-rolled overlay so it gets focus
 * trapping, restore-on-close, Escape and inert background for free — all of which the
 * previous fixed-position div silently lacked on the one screen where a stray Enter
 * keypress is unrecoverable.
 */
export function DeleteDialog({
  volumeName,
  safety,
  open,
  onOpenChange,
}: {
  volumeName: string;
  safety: DeleteSafety;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const hostId = useHostId();
  const [typed, setTyped] = useState('');
  const mutation = useDeleteVolume(hostId, () => {
    router.push(Route.dashboard(hostId));
  });

  const matches = typed === volumeName;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger">
              <TriangleAlert className="size-4.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <DialogTitle>Delete this volume permanently</DialogTitle>
              <DialogDescription className="mt-1">
                {safety.reclaimableBytes === null
                  ? 'This volume has never been measured, so the amount of data about to be destroyed is unknown.'
                  : `${ByteFormat.humanize(safety.reclaimableBytes)} of data will be destroyed. Docker has no undo for this.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (matches && !mutation.isPending) {
              mutation.mutate({ name: volumeName, confirm: typed });
            }
          }}
        >
          <label htmlFor="confirm-name" className="block text-xs text-muted-foreground">
            Type <span className="identifier text-foreground">{volumeName}</span> to confirm
          </label>
          <Input
            id="confirm-name"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            aria-invalid={typed.length > 0 && !matches}
            className="mt-1.5 font-mono"
          />

          {mutation.isError ? (
            <p className="mt-3 text-xs text-danger">{mutation.error.message}</p>
          ) : null}

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!matches}
              loading={mutation.isPending}
            >
              Delete volume
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
