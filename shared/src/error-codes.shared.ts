/**
 * Stable machine-readable failure codes. The client branches on these, never on
 * human-facing messages, so copy can change without breaking behaviour.
 */
export const ErrorCode = Object.freeze({
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  /** Engine socket unreachable, permission denied, or daemon not running. */
  DOCKER_UNAVAILABLE: 'DOCKER_UNAVAILABLE',
  DOCKER_ERROR: 'DOCKER_ERROR',

  VOLUME_NOT_FOUND: 'VOLUME_NOT_FOUND',
  VOLUME_IN_USE: 'VOLUME_IN_USE',
  VOLUME_PROTECTED: 'VOLUME_PROTECTED',
  /** Caller must echo back the volume name to confirm a destructive action. */
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',

  /** The scanner image is absent and could not be pulled. */
  SCAN_IMAGE_UNAVAILABLE: 'SCAN_IMAGE_UNAVAILABLE',
  SCAN_TIMEOUT: 'SCAN_TIMEOUT',
  SCAN_FAILED: 'SCAN_FAILED',
  /** Requested browse path escaped the volume root. */
  PATH_TRAVERSAL_REJECTED: 'PATH_TRAVERSAL_REJECTED',

  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  QUEUE_SATURATED: 'QUEUE_SATURATED',
} as const);
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
