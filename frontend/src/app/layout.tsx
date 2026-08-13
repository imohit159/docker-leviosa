import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { AppShell } from '@/components/layout/app-shell';
import { Providers } from './providers';
import { cn } from '@/lib/utils';
import './globals.css';

/**
 * Fonts are self-hosted from the `geist` package rather than pulled through
 * `next/font/google`.
 *
 * Leviosa is a local tool pointed at a local daemon; needing to reach
 * fonts.googleapis.com to produce a build breaks offline work and any air-gapped CI,
 * and it is an outbound request an infrastructure tool has no business making.
 *
 * `GeistMono` carries the identifiers — volume names, mount paths, image digests — which
 * are compared character by character and so need unambiguous 0/O and 1/l/I.
 */

export const metadata: Metadata = {
  title: 'Leviosa — Docker volume insight',
  description:
    'See how much space your Docker volumes use, what is inside them, which containers depend on them, and which are safe to delete.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `suppressHydrationWarning` is required by next-themes: it writes the resolved
    // colour scheme onto <html> before React hydrates, so server and client markup
    // legitimately differ on this one element.
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(GeistSans.variable, GeistMono.variable)}
    >
      <body className="min-h-screen">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
