'use client';

import type { VolumeConsumer } from '@leviosa/shared';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';

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
    <ul className="flex flex-col divide-y divide-border-subtle">
      {consumers.map((consumer) => (
        <li key={`${consumer.containerId}:${consumer.mountPath}`} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate font-mono text-sm text-content">{consumer.containerName}</span>
            <Badge tone={consumer.live ? 'ok' : 'warn'}>{consumer.state}</Badge>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-content-faint">Mounted at</dt>
            <dd className="truncate font-mono text-content-muted">
              {consumer.mountPath}
              {consumer.readOnly ? <span className="ml-2 text-content-faint">read-only</span> : null}
            </dd>

            <dt className="text-content-faint">Image</dt>
            <dd className="truncate font-mono text-content-muted">{consumer.image}</dd>

            {consumer.composeService ? (
              <>
                <dt className="text-content-faint">Compose</dt>
                <dd className="truncate font-mono text-content-muted">
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
