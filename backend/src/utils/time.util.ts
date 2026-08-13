import { MillisIn } from '@leviosa/shared';

/**
 * Time handling. Every timestamp crossing the wire is an ISO-8601 string in UTC;
 * every timestamp in SQLite is epoch millis. Conversion happens only here.
 */
export const Clock = Object.freeze({
  nowMs(): number {
    return Date.now();
  },

  nowIso(): string {
    return new Date().toISOString();
  },

  toIso(epochMs: number | null | undefined): string | null {
    if (epochMs === null || epochMs === undefined || !Number.isFinite(epochMs) || epochMs <= 0) {
      return null;
    }
    return new Date(epochMs).toISOString();
  },

  /** `stat -c %Y` and Docker's older APIs speak epoch seconds. */
  fromEpochSeconds(seconds: number | null | undefined): number | null {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
      return null;
    }
    return Math.round(seconds * MillisIn.SECOND);
  },

  /** Parses Docker's `CreatedAt`, tolerating the formats it has shipped over time. */
  parseIso(value: string | null | undefined): number | null {
    if (!value) {
      return null;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  },

  daysSince(epochMs: number | null, reference: number = Date.now()): number | null {
    if (epochMs === null) {
      return null;
    }
    return Math.max(0, Math.floor((reference - epochMs) / MillisIn.DAY));
  },

  isOlderThan(epochMs: number | null, ageMs: number, reference: number = Date.now()): boolean {
    if (epochMs === null) {
      return true;
    }
    return reference - epochMs > ageMs;
  },

  daysAgoMs(days: number, reference: number = Date.now()): number {
    return reference - days * MillisIn.DAY;
  },

  /** Cancellable sleep used by retry paths and shutdown grace periods. */
  sleep(ms: number): Promise<void> {
    return new Promise((resolveSleep) => {
      setTimeout(resolveSleep, ms);
    });
  },
});
