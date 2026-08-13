import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Leviosa — Docker volume insight',
  description:
    'See how much space your Docker volumes use, what is inside them, which containers depend on them, and which are safe to delete.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-content antialiased">
        <Providers>
          <AppHeader />
          <main className="mx-auto w-full max-w-7xl px-6 pb-20">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
