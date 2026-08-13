import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';

/**
 * Everything under this group is the product: sidebar, topbar, command palette.
 * The landing page at `/` deliberately lives outside it — marketing chrome and
 * instrument chrome share nothing.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
