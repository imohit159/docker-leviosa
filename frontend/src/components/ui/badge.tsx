import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent';

/** Tone-to-class map, so callers pick a meaning and never a colour. */
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-raised text-content-muted ring-border-strong',
  ok: 'bg-ok-soft text-ok ring-ok/30',
  warn: 'bg-warn-soft text-warn ring-warn/30',
  danger: 'bg-danger-soft text-danger ring-danger/30',
  accent: 'bg-accent-soft text-accent ring-accent/30',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  title,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
