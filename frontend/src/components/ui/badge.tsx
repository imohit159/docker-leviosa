import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'brand';

/**
 * Tone-to-class map, so callers pick a meaning and never a colour. Hue in this product
 * is reserved for status; a badge that is merely decorative uses `neutral`.
 */
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground ring-border',
  ok: 'bg-ok-soft text-ok ring-ok-line',
  warn: 'bg-warn-soft text-warn ring-warn-line',
  danger: 'bg-danger-soft text-danger ring-danger-line',
  brand: 'bg-brand-soft text-brand ring-brand-line',
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
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
