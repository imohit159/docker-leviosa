import { SortDirection, VolumeSortKey } from './enums.shared.js';

/**
 * Contract-level defaults and bounds. The API validator clamps to these and the
 * client seeds its state from them, so both agree without duplicated literals.
 */
export const PaginationDefaults = Object.freeze({
  LIMIT: 50,
  MIN_LIMIT: 1,
  MAX_LIMIT: 200,
  OFFSET: 0,
} as const);

export const VolumeListDefaults = Object.freeze({
  SORT: VolumeSortKey.SIZE,
  ORDER: SortDirection.DESC,
} as const);

export const GrowthDefaults = Object.freeze({
  DAYS: 30,
  MIN_DAYS: 1,
  MAX_DAYS: 365,
  /**
   * Upper bound on points in a growth series. The API downsamples to fit, so a volume
   * scanned hundreds of times still returns a chart-sized payload.
   */
  MAX_POINTS: 60,
} as const);

export const BrowseDefaults = Object.freeze({
  /** Volume-relative root. Every browse path is normalised against this. */
  ROOT_PATH: '/',
  MAX_PATH_LENGTH: 1024,
} as const);

/** Labels Docker Compose stamps onto the resources it creates. */
export const ComposeLabel = Object.freeze({
  PROJECT: 'com.docker.compose.project',
  SERVICE: 'com.docker.compose.service',
  VOLUME: 'com.docker.compose.volume',
} as const);

/** Byte-scale helpers so no module re-derives 1024 ** n. */
export const ByteUnit = Object.freeze({
  KIB: 1024,
  MIB: 1024 ** 2,
  GIB: 1024 ** 3,
  TIB: 1024 ** 4,
} as const);

export const MillisIn = Object.freeze({
  SECOND: 1_000,
  MINUTE: 60_000,
  HOUR: 3_600_000,
  DAY: 86_400_000,
} as const);
