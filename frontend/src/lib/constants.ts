import { DeleteVerdict, MeasurementFreshness, ScanSource, VolumeUsage } from '@leviosa/shared';

/** Polling cadences. Deliberately slow: nothing here changes second to second. */
export const PollInterval = Object.freeze({
  /** While a scan job is in flight. */
  ACTIVE_JOB_MS: 1_200,
  /** Volume list and summary refresh. */
  INVENTORY_MS: 15_000,
  /** Daemon reachability indicator. */
  HEALTH_MS: 30_000,
} as const);

export const QueryConfig = Object.freeze({
  STALE_TIME_MS: 5_000,
  RETRY_COUNT: 1,
} as const);

/** Human-facing copy for each usage class, kept out of the components. */
export const UsageCopy = Object.freeze({
  [VolumeUsage.IN_USE]: {
    label: 'In use',
    description: 'Mounted by at least one running container.',
  },
  [VolumeUsage.RESERVED]: {
    label: 'Reserved',
    description: 'Referenced only by stopped containers. Docker will refuse to remove it.',
  },
  [VolumeUsage.ORPHANED]: {
    label: 'Orphan',
    description: 'No container on this daemon references it.',
  },
} as const);

export const FreshnessCopy = Object.freeze({
  [MeasurementFreshness.UNKNOWN]: 'Never measured',
  [MeasurementFreshness.FRESH]: 'Measured recently',
  [MeasurementFreshness.STALE]: 'Measurement is stale',
} as const);

export const VerdictCopy = Object.freeze({
  [DeleteVerdict.SAFE]: 'Safe to delete',
  [DeleteVerdict.BLOCKED_BY_RUNNING_CONTAINER]: 'Cannot delete: running container',
  [DeleteVerdict.BLOCKED_BY_STOPPED_CONTAINER]: 'Cannot delete: stopped container holds it',
  [DeleteVerdict.BLOCKED_BY_SYSTEM_LABEL]: 'Cannot delete: managed volume',
} as const);

export const ScanSourceCopy = Object.freeze({
  [ScanSource.SIDECAR]: 'Measured inside a throwaway container',
  [ScanSource.HOST_FS]: 'Measured directly from the host filesystem',
} as const);

/** Sort options offered by the toolbar, in display order. */
export const SORT_OPTIONS = Object.freeze([
  { value: 'size', label: 'Size' },
  { value: 'name', label: 'Name' },
  { value: 'createdAt', label: 'Created' },
  { value: 'lastWriteAt', label: 'Last write' },
] as const);

/** Bars in the composition breakdown, capped so the chart stays legible. */
export const BREAKDOWN_LIMIT = 8;
