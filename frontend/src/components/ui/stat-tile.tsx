import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Single headline figure. The unit is rendered separately from the value so a row of
 * tiles stays visually aligned regardless of magnitude.
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger';
}) {
  const valueTone = {
    neutral: 'text-content',
    ok: 'text-ok',
    warn: 'text-warn',
    danger: 'text-danger',
  }[tone];

  return (
    <div className="rounded-xl border border-border-subtle bg-surface px-5 py-4">
      <p className="text-xs font-medium tracking-wide text-content-faint uppercase">{label}</p>
      <p className={cn('mt-2 flex items-baseline gap-1.5', valueTone)}>
        <span className="numeric text-2xl font-semibold">{value}</span>
        {unit ? <span className="text-sm text-content-muted">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-content-faint">{hint}</p> : null}
    </div>
  );
}
