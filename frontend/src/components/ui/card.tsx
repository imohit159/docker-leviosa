import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Panels are separated by a single hairline and one step of surface elevation, never a
 * drop shadow. On a dense grid, shadows stack into visual mud and cost a paint on every
 * poll; a border costs nothing and reads cleanly in both colour schemes.
 */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-border bg-card', className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  hint,
  action,
}: {
  title: ReactNode;
  /** Secondary line explaining what the panel is showing or where the data came from. */
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-4 py-3.5', className)}>{children}</div>;
}
