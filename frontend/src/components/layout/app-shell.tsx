'use client';

import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { SidebarContent } from './app-sidebar';
import { AppTopbar } from './app-topbar';

/**
 * Two-column shell: a fixed rail that never scrolls away, and a content column that
 * owns its own scroll. The rail is worth the 240px because it carries live counts and
 * the reclaimable total — it is a readout, not just a menu.
 *
 * The Suspense boundaries are not optional decoration. Both the rail and the top bar
 * read `useSearchParams`, and without a boundary above them Next bails the whole route
 * out of static rendering at build time.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Suspense fallback={null}>
          <SidebarContent />
        </Suspense>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="h-14 border-b border-border" />}>
          <AppTopbar />
        </Suspense>
        <main className="flex-1 px-4 pb-20 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
