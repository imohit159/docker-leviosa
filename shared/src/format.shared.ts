import { ByteUnit, MillisIn } from './defaults.shared.js';

const EM_DASH = '\u2014';

interface ScaleStep {
  scale: number;
  unit: string;
}

/** Descending so the first match is the largest unit that still yields a value >= 1. */
const BYTE_SCALE: readonly ScaleStep[] = Object.freeze([
  { scale: ByteUnit.TIB, unit: 'TB' },
  { scale: ByteUnit.GIB, unit: 'GB' },
  { scale: ByteUnit.MIB, unit: 'MB' },
  { scale: ByteUnit.KIB, unit: 'KB' },
]);

const BYTES_UNIT = 'B';
const DECIMALS_BELOW_TEN = 1;

/**
 * Byte formatting, shared so the API's log lines and the dashboard's cells agree on
 * what "48.3 GB" means. Units are binary (1024-based) and labelled with the short forms
 * developers actually read, matching what `docker system df` prints.
 */
export const ByteFormat = Object.freeze({
  /** Splits into value and unit, for layouts that style the two differently. */
  split(bytes: number | null | undefined): { value: string; unit: string } {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
      return { value: EM_DASH, unit: '' };
    }
    if (bytes === 0) {
      return { value: '0', unit: BYTES_UNIT };
    }

    for (const step of BYTE_SCALE) {
      if (bytes >= step.scale) {
        const scaled = bytes / step.scale;
        // One decimal below ten keeps "9.4 GB" precise without "941.7 GB" noise.
        return {
          value: scaled < 10 ? scaled.toFixed(DECIMALS_BELOW_TEN) : Math.round(scaled).toString(),
          unit: step.unit,
        };
      }
    }

    return { value: Math.round(bytes).toString(), unit: BYTES_UNIT };
  },

  humanize(bytes: number | null | undefined): string {
    const { value, unit } = ByteFormat.split(bytes);
    return unit.length > 0 ? `${value} ${unit}` : value;
  },

  /** Signed form for growth deltas, e.g. `+6.0 GB`. */
  signed(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
      return EM_DASH;
    }
    if (bytes === 0) {
      return 'no change';
    }
    const sign = bytes > 0 ? '+' : '-';
    return `${sign}${ByteFormat.humanize(Math.abs(bytes))}`;
  },
});

const RELATIVE_STEPS: readonly ScaleStep[] = Object.freeze([
  { scale: MillisIn.DAY * 365, unit: 'year' },
  { scale: MillisIn.DAY * 30, unit: 'month' },
  { scale: MillisIn.DAY, unit: 'day' },
  { scale: MillisIn.HOUR, unit: 'hour' },
  { scale: MillisIn.MINUTE, unit: 'minute' },
]);

/** Timestamp presentation. Every wire timestamp is an ISO-8601 UTC string. */
export const TimeFormat = Object.freeze({
  /** `3 months ago`, `just now`. Returns an em dash for absent values. */
  relative(iso: string | null | undefined, now: number = Date.now()): string {
    if (!iso) {
      return EM_DASH;
    }
    const parsed = Date.parse(iso);
    if (Number.isNaN(parsed)) {
      return EM_DASH;
    }

    const elapsed = Math.max(0, now - parsed);
    for (const step of RELATIVE_STEPS) {
      if (elapsed >= step.scale) {
        const count = Math.floor(elapsed / step.scale);
        return `${String(count)} ${step.unit}${count === 1 ? '' : 's'} ago`;
      }
    }
    return 'just now';
  },

  absolute(iso: string | null | undefined): string {
    if (!iso) {
      return EM_DASH;
    }
    const parsed = Date.parse(iso);
    return Number.isNaN(parsed) ? EM_DASH : new Date(parsed).toLocaleString();
  },

  /** Compact day-level label for chart axes. */
  day(iso: string | null | undefined): string {
    if (!iso) {
      return EM_DASH;
    }
    const parsed = Date.parse(iso);
    if (Number.isNaN(parsed)) {
      return EM_DASH;
    }
    return new Date(parsed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  },
});

/** Thousands separators for file and directory counts. */
export const CountFormat = Object.freeze({
  humanize(count: number | null | undefined): string {
    if (count === null || count === undefined || !Number.isFinite(count)) {
      return EM_DASH;
    }
    return count.toLocaleString();
  },
});

export const PLACEHOLDER_DASH = EM_DASH;
