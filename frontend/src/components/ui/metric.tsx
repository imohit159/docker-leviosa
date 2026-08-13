'use client';

import { ByteFormat, CountFormat, PLACEHOLDER_DASH } from '@leviosa/shared';
import { SlidingNumber } from '@/components/unlumen-ui/primitives/texts/sliding-number';
import { Motion } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * Numeric readouts for polled data.
 *
 * The inventory refetches every fifteen seconds, so figures change underneath a user
 * who is not looking. A hard text swap in that situation is invisible — you cannot tell
 * a re-render from a real change. Rolling only the digits that actually differ turns
 * the poll into a diff channel: motion here is information, not decoration.
 *
 * Every readout mounts with `initiallyStable`, which is the whole trick. Without it the
 * digits count up from zero on first paint and on every remount (filter change, route
 * change), which would be a slot machine, not an instrument.
 */

const SLIDE_TRANSITION = { stiffness: 240, damping: 26, mass: 0.4 };

function isMissing(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined || !Number.isFinite(value);
}

/**
 * Byte size split into a rolling figure and a static unit. The unit is deliberately not
 * animated: "GB" becoming "TB" is a category change and should read as a hard cut.
 */
export function ByteMetric({
  bytes,
  className,
  unitClassName,
}: {
  bytes: number | null | undefined;
  className?: string;
  unitClassName?: string;
}) {
  if (isMissing(bytes)) {
    return <span className={cn('text-muted-foreground', className)}>{PLACEHOLDER_DASH}</span>;
  }

  const { value, unit } = ByteFormat.split(bytes);
  const numeric = Number.parseFloat(value);
  const decimals = value.includes('.') ? 1 : 0;

  return (
    <span className={cn('inline-flex items-baseline gap-1', className)}>
      <SlidingNumber
        number={numeric}
        decimalPlaces={decimals}
        transition={SLIDE_TRANSITION}
        initiallyStable
        aria-label={`${value} ${unit}`}
      />
      <span className={cn('text-[0.7em] font-normal text-muted-foreground', unitClassName)}>
        {unit}
      </span>
    </span>
  );
}

/** Whole-number readout: volume counts, container counts, file counts. */
export function CountMetric({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  if (isMissing(value)) {
    return <span className={cn('text-muted-foreground', className)}>{PLACEHOLDER_DASH}</span>;
  }

  // Past four digits the rolling columns stop being readable and start being busy;
  // a locale-grouped static string is the honest presentation.
  if (value >= 10_000) {
    return <span className={cn('numeric', className)}>{CountFormat.humanize(value)}</span>;
  }

  return (
    <SlidingNumber
      number={value}
      transition={SLIDE_TRANSITION}
      initiallyStable
      className={className}
      aria-label={String(value)}
    />
  );
}

/** Signed byte delta for growth windows, coloured by direction. */
export function DeltaMetric({
  bytes,
  className,
}: {
  bytes: number | null | undefined;
  className?: string;
}) {
  if (isMissing(bytes)) {
    return <span className={cn('text-muted-foreground', className)}>{PLACEHOLDER_DASH}</span>;
  }

  const tone =
    bytes > 0 ? 'text-warn' : bytes < 0 ? 'text-ok' : 'text-muted-foreground';

  return (
    <span
      className={cn('numeric font-medium tabular-nums', tone, className)}
      style={{ transitionDuration: `${Motion.FADE_MS}s` }}
    >
      {ByteFormat.signed(bytes)}
    </span>
  );
}
