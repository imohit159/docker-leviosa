/**
 * Closed value sets shared across the wire. Declared as frozen const maps (never
 * TypeScript `enum`) so they survive `erasableSyntaxOnly` compilation and can be
 * iterated at runtime by both the API validators and the client filters.
 */

/** How a volume relates to the current container inventory. */
export const VolumeUsage = Object.freeze({
  /** Referenced by at least one running container. */
  IN_USE: 'IN_USE',
  /** Referenced only by stopped/created containers: Docker will refuse to prune it. */
  RESERVED: 'RESERVED',
  /** No container references it at all. */
  ORPHANED: 'ORPHANED',
} as const);
export type VolumeUsage = (typeof VolumeUsage)[keyof typeof VolumeUsage];

/** Why a delete request is or is not allowed to proceed. */
export const DeleteVerdict = Object.freeze({
  SAFE: 'SAFE',
  BLOCKED_BY_RUNNING_CONTAINER: 'BLOCKED_BY_RUNNING_CONTAINER',
  BLOCKED_BY_STOPPED_CONTAINER: 'BLOCKED_BY_STOPPED_CONTAINER',
  BLOCKED_BY_SYSTEM_LABEL: 'BLOCKED_BY_SYSTEM_LABEL',
} as const);
export type DeleteVerdict = (typeof DeleteVerdict)[keyof typeof DeleteVerdict];

/** Where a size measurement came from. Surfaced so the UI can explain accuracy. */
export const ScanSource = Object.freeze({
  /** Throwaway container with the volume bind-mounted read-only. Works on every topology. */
  SIDECAR: 'SIDECAR',
  /** Direct filesystem walk of the mountpoint. Only when the API process can read it. */
  HOST_FS: 'HOST_FS',
} as const);
export type ScanSource = (typeof ScanSource)[keyof typeof ScanSource];

/** Lifecycle of an asynchronous measurement job. */
export const JobState = Object.freeze({
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const);
export type JobState = (typeof JobState)[keyof typeof JobState];

/** Freshness of the cached size figure a volume row is rendering. */
export const MeasurementFreshness = Object.freeze({
  /** Never measured. */
  UNKNOWN: 'UNKNOWN',
  /** Measured within the configured cache window. */
  FRESH: 'FRESH',
  /** Measured, but older than the cache window. */
  STALE: 'STALE',
} as const);
export type MeasurementFreshness = (typeof MeasurementFreshness)[keyof typeof MeasurementFreshness];

/** Filesystem node kinds we report while browsing a volume. */
export const EntryKind = Object.freeze({
  DIRECTORY: 'DIRECTORY',
  FILE: 'FILE',
  SYMLINK: 'SYMLINK',
  OTHER: 'OTHER',
} as const);
export type EntryKind = (typeof EntryKind)[keyof typeof EntryKind];

/** Sort keys accepted by the volume collection endpoint. */
export const VolumeSortKey = Object.freeze({
  NAME: 'name',
  SIZE: 'size',
  CREATED_AT: 'createdAt',
  LAST_WRITE_AT: 'lastWriteAt',
} as const);
export type VolumeSortKey = (typeof VolumeSortKey)[keyof typeof VolumeSortKey];

export const SortDirection = Object.freeze({
  ASC: 'asc',
  DESC: 'desc',
} as const);
export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];

/** Container lifecycle states as reported by the Docker Engine API. */
export const ContainerState = Object.freeze({
  CREATED: 'created',
  RUNNING: 'running',
  PAUSED: 'paused',
  RESTARTING: 'restarting',
  REMOVING: 'removing',
  EXITED: 'exited',
  DEAD: 'dead',
} as const);
export type ContainerState = (typeof ContainerState)[keyof typeof ContainerState];

/** States in which a container is actively holding its mounts. */
export const LIVE_CONTAINER_STATES: readonly ContainerState[] = Object.freeze([
  ContainerState.RUNNING,
  ContainerState.PAUSED,
  ContainerState.RESTARTING,
]);
