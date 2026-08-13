'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryConfig, ThemeConfig, Motion } from '@/lib/constants';

/**
 * One QueryClient per browser session, created in state so React's strict-mode double
 * render cannot produce two competing caches.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: QueryConfig.STALE_TIME_MS,
            retry: QueryConfig.RETRY_COUNT,
            // The dashboard already polls on an interval; refetching on every window
            // focus on top of that is just extra load on the daemon.
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={ThemeConfig.DEFAULT}
      enableSystem
      // Colour transitions during a theme swap read as a rendering glitch on a page
      // this dense; the View Transition circle wipe carries the change instead.
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {/* Tooltips carry the detail this UI strips out of the dense views (full mount
            paths, scan provenance, absolute timestamps), so they need to appear fast
            enough to feel like part of the same glance. */}
        <TooltipProvider delay={Motion.TOOLTIP_DELAY_MS}>{children}</TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
