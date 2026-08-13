import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import type { RequestHandler } from 'express';
import { HttpHeader, HttpStatus } from '../config/index.config.js';
import { Logger } from '../utils/index.utils.js';

/**
 * Request logging with a correlation id.
 *
 * Failures are reported by the error middleware, so this logger stays at debug for
 * successful traffic: a volume dashboard polls, and info-level access logs would bury
 * everything that matters.
 */
export const RequestLogMiddleware = Object.freeze({
  handle(): RequestHandler {
    return pinoHttp({
      logger: Logger.for('http'),
      genReqId: (req, res) => {
        const existing = req.headers[HttpHeader.REQUEST_ID];
        const id = typeof existing === 'string' && existing.length > 0 ? existing : randomUUID();
        res.setHeader(HttpHeader.REQUEST_ID, id);
        return id;
      },
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= HttpStatus.INTERNAL) {
          return 'error';
        }
        if (res.statusCode >= HttpStatus.BAD_REQUEST) {
          return 'warn';
        }
        return 'debug';
      },
      customSuccessMessage: (req, res) => `${req.method ?? 'GET'} ${String(res.statusCode)}`,
    }) as RequestHandler;
  },
});
