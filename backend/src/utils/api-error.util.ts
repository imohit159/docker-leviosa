import { ErrorCode } from '@leviosa/shared';
import type { ApiFieldIssue } from '@leviosa/shared';
import { HttpStatus } from '../config/index.config.js';

interface ApiErrorOptions {
  status: HttpStatus;
  code: ErrorCode;
  message: string;
  issues?: ApiFieldIssue[];
  details?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * The only error type the HTTP layer is allowed to serialise. Anything else that
 * reaches the error middleware is treated as an unexpected fault and reported as
 * INTERNAL_ERROR without leaking its message.
 */
export class ApiError extends Error {
  readonly status: HttpStatus;
  readonly code: ErrorCode;
  readonly issues?: ApiFieldIssue[];
  readonly details?: Record<string, unknown>;

  constructor(options: ApiErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.issues = options.issues;
    this.details = options.details;
  }

  static isApiError(value: unknown): value is ApiError {
    return value instanceof ApiError;
  }
}

/**
 * Factories for every failure this service can produce. Constructing errors here
 * rather than inline keeps status/code pairings consistent across controllers.
 */
export const ApiErrors = Object.freeze({
  validation(message: string, issues: ApiFieldIssue[]): ApiError {
    return new ApiError({
      status: HttpStatus.BAD_REQUEST,
      code: ErrorCode.VALIDATION_FAILED,
      message,
      issues,
    });
  },

  routeNotFound(method: string, path: string): ApiError {
    return new ApiError({
      status: HttpStatus.NOT_FOUND,
      code: ErrorCode.ROUTE_NOT_FOUND,
      message: `No route matches ${method} ${path}.`,
    });
  },

  volumeNotFound(name: string): ApiError {
    return new ApiError({
      status: HttpStatus.NOT_FOUND,
      code: ErrorCode.VOLUME_NOT_FOUND,
      message: `Volume "${name}" does not exist on this daemon.`,
      details: { volumeName: name },
    });
  },

  jobNotFound(id: string): ApiError {
    return new ApiError({
      status: HttpStatus.NOT_FOUND,
      code: ErrorCode.JOB_NOT_FOUND,
      message: `Scan job "${id}" is unknown. Jobs are held in memory and are lost on restart.`,
      details: { jobId: id },
    });
  },

  dockerUnavailable(reason: string, cause?: unknown): ApiError {
    return new ApiError({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: ErrorCode.DOCKER_UNAVAILABLE,
      message: `Docker daemon is unreachable: ${reason}`,
      cause,
    });
  },

  dockerError(message: string, cause?: unknown): ApiError {
    return new ApiError({
      status: HttpStatus.INTERNAL,
      code: ErrorCode.DOCKER_ERROR,
      message,
      cause,
    });
  },

  volumeInUse(name: string, details: Record<string, unknown>): ApiError {
    return new ApiError({
      status: HttpStatus.CONFLICT,
      code: ErrorCode.VOLUME_IN_USE,
      message: `Volume "${name}" is still referenced by one or more containers.`,
      details,
    });
  },

  volumeProtected(name: string, reason: string): ApiError {
    return new ApiError({
      status: HttpStatus.FORBIDDEN,
      code: ErrorCode.VOLUME_PROTECTED,
      message: `Volume "${name}" is protected: ${reason}`,
      details: { volumeName: name },
    });
  },

  confirmationRequired(name: string): ApiError {
    return new ApiError({
      status: HttpStatus.BAD_REQUEST,
      code: ErrorCode.CONFIRMATION_REQUIRED,
      message: `Destructive action requires "confirm" to equal the volume name "${name}".`,
      details: { volumeName: name },
    });
  },

  scanImageUnavailable(image: string, cause?: unknown): ApiError {
    return new ApiError({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: ErrorCode.SCAN_IMAGE_UNAVAILABLE,
      message: `Scanner image "${image}" is not present locally and could not be pulled.`,
      details: { image },
      cause,
    });
  },

  scanTimeout(volumeName: string, timeoutMs: number): ApiError {
    return new ApiError({
      status: HttpStatus.GATEWAY_TIMEOUT,
      code: ErrorCode.SCAN_TIMEOUT,
      message: `Measuring "${volumeName}" exceeded the ${timeoutMs}ms budget. Raise SCAN_TIMEOUT_MS for very large volumes.`,
      details: { volumeName, timeoutMs },
    });
  },

  scanFailed(volumeName: string, reason: string, cause?: unknown): ApiError {
    return new ApiError({
      status: HttpStatus.INTERNAL,
      code: ErrorCode.SCAN_FAILED,
      message: `Measuring "${volumeName}" failed: ${reason}`,
      details: { volumeName },
      cause,
    });
  },

  pathNotFound(volumeName: string, path: string): ApiError {
    return new ApiError({
      status: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
      message: `Path "${path}" is not a directory inside volume "${volumeName}".`,
      details: { volumeName, path },
    });
  },

  pathTraversal(path: string): ApiError {
    return new ApiError({
      status: HttpStatus.BAD_REQUEST,
      code: ErrorCode.PATH_TRAVERSAL_REJECTED,
      message: `Path "${path}" resolves outside the volume root.`,
      details: { path },
    });
  },

  queueSaturated(limit: number): ApiError {
    return new ApiError({
      status: HttpStatus.TOO_MANY_REQUESTS,
      code: ErrorCode.QUEUE_SATURATED,
      message: `Scan queue is full (${limit} pending). Wait for in-flight scans to drain.`,
      details: { limit },
    });
  },

  featureDisabled(feature: string): ApiError {
    return new ApiError({
      status: HttpStatus.FORBIDDEN,
      code: ErrorCode.VOLUME_PROTECTED,
      message: `${feature} is disabled by configuration.`,
      details: { feature },
    });
  },

  internal(message: string, cause?: unknown): ApiError {
    return new ApiError({
      status: HttpStatus.INTERNAL,
      code: ErrorCode.INTERNAL_ERROR,
      message,
      cause,
    });
  },

  /**
   * Normalises anything thrown below the controller layer. Deliberate failures pass
   * through untouched; unexpected ones are annotated with the operation that produced
   * them, which is the difference between a useful log line and "500".
   */
  wrapUnknown(error: unknown, context: string): ApiError {
    if (ApiError.isApiError(error)) {
      return error;
    }
    return ApiErrors.internal(`Unexpected failure while ${context}.`, error);
  },
});
