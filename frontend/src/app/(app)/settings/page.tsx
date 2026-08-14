'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useHostsWithStatus } from '@/hooks/index.hooks';
import { Button } from '@/components/ui/button';
import { ShimmerSkeleton } from '@/components/unlumen-ui/shimmer-skeleton';
import { HostCard } from '@/components/hosts/host-card';
import { HostFormDialog } from '@/components/hosts/host-form-dialog';

/**
 * Host registry management.
 *
 * Deliberately a page rather than a modal: registering a host involves reading a
 * fingerprint off a terminal on another machine, and a dialog that has to stay open
 * across that context switch is a dialog people dismiss and start over.
 */
export default function SettingsPage() {
  const [isAdding, setIsAdding] = useState(false);
  const { hosts, isLoading } = useHostsWithStatus();

  return (
    <div className="flex flex-col gap-5 pt-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Hosts</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every Docker daemon Leviosa monitors. Remote hosts are reached by tunnelling the
            Engine API over SSH — no daemon port is exposed, and no credentials are stored here.
          </p>
        </div>

        <Button onClick={() => setIsAdding(true)}>
          <Plus className="size-3.5" aria-hidden />
          Add host
        </Button>
      </header>

      {isLoading && hosts.length === 0 ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }, (_, index) => (
            <ShimmerSkeleton key={index} className="h-24 w-full" rounded="lg" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {hosts.map((host) => (
            <HostCard key={host.id} host={host} />
          ))}
        </div>
      )}

      <HostFormDialog host={null} open={isAdding} onOpenChange={setIsAdding} />
    </div>
  );
}
