import { ByteFormat, ByteUnit } from '@leviosa/shared';

/** Byte arithmetic. No module re-derives 1024 ** n locally. */
export const Bytes = Object.freeze({
  /** `du` reports kibibytes; the API only ever exposes bytes. */
  fromKib(kib: number): number {
    return Math.round(kib * ByteUnit.KIB);
  },

  /** Log-line formatting, delegated to the shared formatter the UI also uses. */
  format(bytes: number): string {
    return ByteFormat.humanize(bytes);
  },

  sum(values: readonly number[]): number {
    return values.reduce((total, value) => total + value, 0);
  },
});
