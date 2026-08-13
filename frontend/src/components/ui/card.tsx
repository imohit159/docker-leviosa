import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border-subtle bg-surface',
        className,
      )}
    >
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
    <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-content">{title}</h2>
        {hint ? <p className="mt-1 text-xs text-content-faint">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}
