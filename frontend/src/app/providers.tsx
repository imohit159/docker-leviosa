'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { QueryConfig } from '@/lib/constants';

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

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
