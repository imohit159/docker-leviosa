import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { LOCAL_HOST_ID } from '../config/index.config.js';
import { HostRegistry } from '../docker/index.docker.js';
import type { HostContext } from '../docker/index.docker.js';
import { ApiErrors } from '../utils/index.utils.js';
import { HostValidation } from '../validations/index.validations.js';

/** Route parameter name, declared once and reused by the router and handlers. */
export const HOST_ID_PARAM = 'hostId';

/**
 * A request that has been through a host resolver.
 *
 * Declared locally and cast at the two places that touch it, rather than augmenting
 * Express's global `Request`. Widening the global type would advertise `hostContext` on
 * every request in the codebase, including the ones where it is never set, and the
 * optional property would then read as "sometimes present" everywhere instead of
 * "guaranteed behind this middleware".
 */
interface HostScopedRequest extends Request {
  hostContext?: HostContext;
}

/**
 * Resolves the addressed host once per request and attaches it.
 *
 * Doing this in middleware rather than in each handler means a controller cannot
 * forget: `HostMiddleware.require` throws if the context is missing, so a route
 * mounted without the resolver fails immediately and loudly instead of quietly
 * operating on the local daemon.
 */
export const HostMiddleware = Object.freeze({
  /** For routes nested under `/hosts/:hostId`. */
  fromParam(): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction): void => {
      try {
        const hostId = HostValidation.hostId(req.params[HOST_ID_PARAM]);
        (req as HostScopedRequest).hostContext = HostRegistry.get(hostId);
        next();
      } catch (error) {
        next(error);
      }
    };
  },

  /**
   * For the legacy flat paths, which predate multi-host and always meant this machine.
   *
   * Kept as aliases so existing bookmarks and any client mid-upgrade keep working;
   * they resolve to the reserved local host and nothing else.
   */
  localAlias(): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction): void => {
      try {
        (req as HostScopedRequest).hostContext = HostRegistry.get(LOCAL_HOST_ID);
        next();
      } catch (error) {
        next(error);
      }
    };
  },

  /** Reads the resolved context, or fails loudly if the route was mounted wrong. */
  require(req: Request): HostContext {
    const host = (req as HostScopedRequest).hostContext;
    if (!host) {
      throw ApiErrors.internal('Route is missing its host resolver.');
    }
    return host;
  },
});
