import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StatTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'brand';

const VALUE_TONE: Record<StatTone, string> = {
  neutral: 'text-foreground',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  brand: 'text-brand',
};

/**
 * Single headline figure.
 *
 * The value slot takes a node rather than a string so callers can pass an animated
 * metric; the tile owns typography and alignment, the metric owns the number. Keeping
 * those separate is what stops every tile from re-implementing byte formatting.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border bg-card px-4 py-3.5',
        'transition-colors hover:border-input',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
      </div>

      <div
        className={cn(
          'numeric mt-2 flex items-baseline text-2xl leading-none font-semibold tracking-tight',
          VALUE_TONE[tone],
        )}
      >
        {value}
      </div>

      {hint ? <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
