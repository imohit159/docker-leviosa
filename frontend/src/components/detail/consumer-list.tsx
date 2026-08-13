'use client';

import type { VolumeConsumer } from '@leviosa/shared';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { CopyButton } from '@/components/unlumen-ui/copy';

/**
 * The dependency answer: which containers mount this volume, where, and whether they are
 * running. Stopped containers are listed with equal prominence because they are the
 * reason a "clearly unused" volume refuses to delete.
 */
export function ConsumerList({ consumers }: { consumers: VolumeConsumer[] }) {
  if (consumers.length === 0) {
    return (
      <EmptyState
        title="No containers reference this volume"
        hint="Nothing on this daemon has it mounted, running or stopped."
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {consumers.map((consumer) => (
        <li
          key={`${consumer.containerId}:${consumer.mountPath}`}
          className="group flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="identifier truncate text-[13px] font-medium text-foreground">
                {consumer.containerName}
              </span>
              <CopyButton
                content={consumer.containerName}
                variant="ghost"
                size="xs"
                aria-label={`Copy ${consumer.containerName}`}
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              />
            </span>
            <Badge tone={consumer.live ? 'ok' : 'warn'}>{consumer.state}</Badge>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Mounted at</dt>
            <dd className="identifier truncate text-foreground" title={consumer.mountPath}>
              {consumer.mountPath}
              {consumer.readOnly ? (
                <span className="ml-2 font-sans text-muted-foreground">read-only</span>
              ) : null}
            </dd>

            <dt className="text-muted-foreground">Image</dt>
            <dd className="identifier truncate text-foreground" title={consumer.image}>
              {consumer.image}
            </dd>

            {consumer.composeService ? (
              <>
                <dt className="text-muted-foreground">Compose</dt>
                <dd className="identifier truncate text-foreground">
                  {consumer.composeProject ?? '—'} / {consumer.composeService}
                </dd>
              </>
            ) : null}
          </dl>
        </li>
      ))}
    </ul>
  );
}
