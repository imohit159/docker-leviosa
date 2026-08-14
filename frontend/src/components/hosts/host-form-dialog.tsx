'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import type { DockerHost } from '@leviosa/shared';
import { useCreateHost, useUpdateHost } from '@/hooks/index.hooks';
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
import { ApiRequestError } from '@/lib/api.client';

/** OpenSSH's own default, so the field can be left alone in the common case. */
const DEFAULT_SSH_PORT = 22;

/** Prefer field-level API issues over the generic "Invalid host." banner. */
function _mutationErrorText(error: Error): string {
  if (error instanceof ApiRequestError && error.issues && error.issues.length > 0) {
    return error.issues.map((issue) => issue.message).join(' ');
  }
  return error.message;
}

interface DraftHost {
  label: string;
  host: string;
  port: string;
  user: string;
  keyPath: string;
}

function _draftFrom(host: DockerHost | null): DraftHost {
  return {
    label: host?.label ?? '',
    host: host?.ssh?.host ?? '',
    port: String(host?.ssh?.port ?? DEFAULT_SSH_PORT),
    user: host?.ssh?.user ?? '',
    keyPath: host?.ssh?.keyPath ?? '',
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {hint ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

/**
 * Registers or edits an SSH host.
 *
 * There is no password field and no key upload, and that is a design decision rather
 * than an omission: Leviosa authenticates through a key already on this machine or
 * through the running SSH agent, so its database never becomes somewhere credentials
 * can leak from. The API rejects key material outright, so adding the field here would
 * only produce a form that always fails.
 */
export function HostFormDialog({
  host,
  open,
  onOpenChange,
}: {
  /** Null when registering a new host. */
  host: DockerHost | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = host !== null;
  const [draft, setDraft] = useState<DraftHost>(() => _draftFrom(host));

  const create = useCreateHost();
  const update = useUpdateHost();
  const mutation = isEdit ? update : create;

  const set = (key: keyof DraftHost) => (event: { target: { value: string } }) => {
    setDraft((previous) => ({ ...previous, [key]: event.target.value }));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();

    const ssh = {
      host: draft.host.trim(),
      port: Number(draft.port) || DEFAULT_SSH_PORT,
      user: draft.user.trim(),
      keyPath: draft.keyPath.trim() === '' ? null : draft.keyPath.trim(),
    };

    const settle = { onSuccess: () => onOpenChange(false) };

    if (isEdit) {
      update.mutate({ hostId: host.id, patch: { label: draft.label.trim(), ssh } }, settle);
      return;
    }
    create.mutate({ label: draft.label.trim(), ssh }, settle);
  };

  const isComplete =
    draft.label.trim() !== '' && draft.host.trim() !== '' && draft.user.trim() !== '';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(_draftFrom(host));
          mutation.reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${host.label}` : 'Add a Docker host'}</DialogTitle>
          <DialogDescription className="mt-1">
            Leviosa tunnels the Docker Engine API over SSH. The login user must be able to reach
            the Docker socket on the remote machine.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Label" hint="How this machine appears in the host switcher.">
            <Input
              autoFocus
              value={draft.label}
              onChange={set('label')}
              placeholder="Production VPS"
            />
          </Field>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Hostname or address">
              <Input
                value={draft.host}
                onChange={set('host')}
                placeholder="vps.example.com"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
            </Field>
            <Field label="Port">
              <Input
                value={draft.port}
                onChange={set('port')}
                inputMode="numeric"
                className="w-20 font-mono"
              />
            </Field>
          </div>

          <Field label="SSH user">
            <Input
              value={draft.user}
              onChange={set('user')}
              placeholder="root"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </Field>

          <Field
            label="Private key path"
            hint="A path on the machine running Leviosa. Leave empty to use the SSH agent."
          >
            <Input
              value={draft.keyPath}
              onChange={set('keyPath')}
              placeholder="~/.ssh/id_ed25519"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </Field>

          <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
            <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Leviosa never stores passwords or private keys — only the path to a key already on
              this machine. On first connection you will be asked to confirm the host&apos;s
              fingerprint.
            </span>
          </p>

          {mutation.isError ? (
            <p className="text-xs text-danger">{_mutationErrorText(mutation.error)}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isComplete} loading={mutation.isPending}>
              {isEdit ? 'Save changes' : 'Add host'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
