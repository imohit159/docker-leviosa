import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ErrorCode } from '@leviosa/shared';
import type { ApiFailure } from '@leviosa/shared';
import { Config, HttpStatus } from '../config/index.config.js';
import { ApiError, ApiErrors, Logger } from '../utils/index.utils.js';

const log = Logger.for('http');

/** 5xx responses are logged at error level; 4xx are the client's problem, not a fault. */
function _isServerFault(status: number): boolean {
  return status >= HttpStatus.INTERNAL;
}

export const ErrorMiddleware = Object.freeze({
  /** Terminal 404 for unmatched routes, so the envelope stays consistent. */
  notFound(): RequestHandler {
    return (req, _res, next) => {
      next(ApiErrors.routeNotFound(req.method, req.originalUrl));
    };
  },

  /**
   * The single serialisation point for failures. Unknown throwables never reach the
   * client verbatim: they are logged in full and reported as INTERNAL_ERROR, because an
   * exception message is as likely to contain a filesystem path as anything useful.
   */
  handle(): ErrorRequestHandler {
    return (error, req, res, _next) => {
      const apiError = ApiError.isApiError(error)
        ? error
        : ApiErrors.internal('An unexpected error occurred.', error);

      const logPayload = {
        err: error,
        method: req.method,
        url: req.originalUrl,
        code: apiError.code,
        status: apiError.status,
      };

      if (_isServerFault(apiError.status)) {
        log.error(logPayload, 'request failed');
      } else {
        log.debug(logPayload, 'request rejected');
      }

      // Headers already sent means a response was streaming; there is nothing to say.
      if (res.headersSent) {
        res.end();
        return;
      }

      const exposeMessage = apiError.code !== ErrorCode.INTERNAL_ERROR || !Config.isProduction;
      const body: ApiFailure = {
        success: false,
        error: {
          code: apiError.code,
          message: exposeMessage ? apiError.message : 'An unexpected error occurred.',
          ...(apiError.issues ? { issues: apiError.issues } : {}),
          ...(apiError.details ? { details: apiError.details } : {}),
        },
      };

      res.status(apiError.status).json(body);
    };
  },
});
