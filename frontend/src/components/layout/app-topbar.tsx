'use client';

import { useState } from 'react';
import { PanelLeft } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ThemeSwitch } from '@/components/unlumen-ui/theme-switch';
import { SidebarContent } from './app-sidebar';
import { CommandPalette } from './command-palette';
import { DaemonStatus } from './daemon-status';

/**
 * The top bar holds the two things that are true on every screen — how to find a volume,
 * and whether the daemon is answering — and nothing else. Page titles live in the page,
 * because a title bar that restates the H1 is a wasted 56px on a table view.
 */
export function AppTopbar() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-8">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation">
                <PanelLeft className="size-4" />
              </Button>
            }
          />
          <SheetContent side="left" className="w-64 bg-sidebar p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 items-center">
          <CommandPalette />
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <div className="hidden sm:block">
            <DaemonStatus />
          </div>
          <ThemeSwitch className="size-8" iconSize={15} />
        </div>
      </div>
    </header>
  );
}
