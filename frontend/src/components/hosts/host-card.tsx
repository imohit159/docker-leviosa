'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Cloud,
  Fingerprint,
  Pencil,
  PlugZap,
  Server,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { HostKind, HostProbeOutcome, TimeFormat } from '@leviosa/shared';
import type { HostConnectionTest } from '@leviosa/shared';
import { Route } from '@/lib/constants';
import { useRemoveHost, useTestHost, useTrustHostKey } from '@/hooks/index.hooks';
import type { HostWithStatus } from '@/hooks/use-hosts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { CopyButton } from '@/components/unlumen-ui/copy';
import { cn } from '@/lib/utils';
import { HostFormDialog } from './host-form-dialog';

/** Tone per probe outcome, so the panel picks a meaning rather than a colour. */
const OUTCOME_TONE = {
  [HostProbeOutcome.OK]: 'ok',
  [HostProbeOutcome.FINGERPRINT_UNVERIFIED]: 'warn',
  [HostProbeOutcome.AUTH_FAILED]: 'danger',
  [HostProbeOutcome.SSH_UNREACHABLE]: 'danger',
  [HostProbeOutcome.DAEMON_UNREACHABLE]: 'danger',
} as const;

const OUTCOME_LABEL = {
  [HostProbeOutcome.OK]: 'Connected',
  [HostProbeOutcome.FINGERPRINT_UNVERIFIED]: 'Host key not confirmed',
  [HostProbeOutcome.AUTH_FAILED]: 'Authentication rejected',
  [HostProbeOutcome.SSH_UNREACHABLE]: 'SSH unreachable',
  [HostProbeOutcome.DAEMON_UNREACHABLE]: 'Docker unreachable',
} as const;

/**
 * The trust-on-first-use prompt.
 *
 * The fingerprint is shown large, monospaced and copyable because the operator is
 * expected to compare it against `ssh-keygen -lf` on the server. A prompt that makes
 * that comparison inconvenient is a prompt everyone clicks through, which reduces the
 * entire host-key check to theatre.
 */
function FingerprintPrompt({ host, probe }: { host: HostWithStatus; probe: HostConnectionTest }) {
  const trust = useTrustHostKey();
  const fingerprint = probe.presentedFingerprint;

  if (fingerprint === null) {
    return null;
  }

  const isRotation = host.hostKeyFingerprint !== null;

  return (
    <div
      className={cn(
        'mt-3 rounded-lg border p-3',
        isRotation ? 'border-danger-line bg-danger-soft' : 'border-warn-line bg-warn-soft',
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Fingerprint className="size-3.5" aria-hidden />
        {isRotation ? 'This host key has changed' : 'Confirm this host key'}
      </p>

      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        {isRotation
          ? 'The key no longer matches the one you pinned. That means the server was rebuilt — or something is impersonating it. Do not accept this unless you know the machine was reinstalled.'
          : 'Run ssh-keygen -lf on the server and check that the fingerprint below matches exactly.'}
      </p>

      <div className="mt-2 flex items-center gap-1.5 rounded-md bg-background/60 px-2 py-1.5">
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
          {fingerprint}
        </code>
        <CopyButton
          content={fingerprint}
          variant="ghost"
          size="xs"
          aria-label="Copy fingerprint"
          className="shrink-0 text-muted-foreground"
        />
      </div>

      {trust.isError ? <p className="mt-2 text-[11px] text-danger">{trust.error.message}</p> : null}

      <Button
        size="xs"
        variant={isRotation ? 'destructive' : 'outline'}
        loading={trust.isPending}
        className="mt-2.5"
        onClick={() => trust.mutate({ hostId: host.id, fingerprint })}
      >
        <ShieldCheck className="size-3.5" aria-hidden />
        {isRotation ? 'Accept the new key' : 'This fingerprint is correct'}
      </Button>
    </div>
  );
}

function ProbeResult({ host, probe }: { host: HostWithStatus; probe: HostConnectionTest }) {
  const tone = OUTCOME_TONE[probe.outcome];

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{OUTCOME_LABEL[probe.outcome]}</Badge>
        {probe.daemonVersion ? (
          <span className="identifier text-[11px] text-muted-foreground">
            Docker {probe.daemonVersion}
          </span>
        ) : null}
        <span className="numeric text-[11px] text-muted-foreground">{probe.roundTripMs} ms</span>
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{probe.detail}</p>

      {probe.outcome === HostProbeOutcome.FINGERPRINT_UNVERIFIED ? (
        <FingerprintPrompt host={host} probe={probe} />
      ) : null}
    </div>
  );
}

export function HostCard({ host }: { host: HostWithStatus }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const test = useTestHost();
  const remove = useRemoveHost();

  const Icon = host.kind === HostKind.SSH ? Cloud : Server;
  const endpoint = host.ssh
    ? `${host.ssh.user}@${host.ssh.host}:${String(host.ssh.port)}`
    : 'This machine';

  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              className={cn(
                'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                host.reachable ? 'bg-ok-soft text-ok' : 'bg-muted text-muted-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-medium text-foreground">{host.label}</h3>
                {host.readOnly ? <Badge tone="neutral">Built in</Badge> : null}
                {!host.enabled ? <Badge tone="neutral">Disabled</Badge> : null}
                {host.hostKeyFingerprint ? (
                  <Badge tone="ok" title={host.hostKeyFingerprint}>
                    <ShieldCheck className="size-3" aria-hidden />
                    Key pinned
                  </Badge>
                ) : null}
              </div>

              <p className="identifier mt-0.5 truncate text-[11px] text-muted-foreground">
                {endpoint}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {host.ssh?.keyPath
                  ? `Key at ${host.ssh.keyPath}`
                  : host.kind === HostKind.SSH
                    ? 'Authenticating through the SSH agent'
                    : 'Local socket'}
                {' · '}
                {host.lastSeenAt
                  ? `last seen ${TimeFormat.relative(host.lastSeenAt)}`
                  : 'never reached'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="xs"
              variant="outline"
              loading={test.isPending}
              onClick={() => test.mutate(host.id)}
            >
              <PlugZap className="size-3.5" aria-hidden />
              Test
            </Button>

            {host.readOnly ? null : (
              <>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Edit ${host.label}`}
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="size-3.5" aria-hidden />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remove ${host.label}`}
                  className="text-muted-foreground hover:text-danger"
                  onClick={() => setIsConfirmingDelete(true)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </>
            )}

            <Button
              size="xs"
              variant="ghost"
              nativeButton={false}
              render={<Link href={Route.dashboard(host.id)} />}
            >
              Open
              <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>

        {test.data ? <ProbeResult host={host} probe={test.data} /> : null}
        {test.isError ? <p className="mt-3 text-xs text-danger">{test.error.message}</p> : null}

        {isConfirmingDelete ? (
          <div className="mt-3 rounded-lg border border-danger-line bg-danger-soft p-3">
            <p className="text-xs text-foreground">
              Remove <span className="identifier">{host.label}</span> and every measurement
              recorded for it?
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Nothing on the remote machine is touched. Only Leviosa&apos;s own history for this
              host is deleted, and that history cannot be rebuilt — sizes are sampled over time,
              not read back from Docker.
            </p>
            {remove.isError ? (
              <p className="mt-2 text-[11px] text-danger">{remove.error.message}</p>
            ) : null}
            <div className="mt-2.5 flex gap-1.5">
              <Button
                size="xs"
                variant="destructive"
                loading={remove.isPending}
                onClick={() => remove.mutate(host.id)}
              >
                Remove host
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setIsConfirmingDelete(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </CardBody>

      <HostFormDialog host={host} open={isEditing} onOpenChange={setIsEditing} />
    </Card>
  );
}
