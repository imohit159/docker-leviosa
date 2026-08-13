import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Funnels rejected promises into Express' error pipeline. Express 5 forwards async
 * rejections on its own, but wrapping keeps the contract explicit and stays correct
 * if the app is ever mounted on an Express 4 router.
 */
export const AsyncHandler = Object.freeze({
  wrap<TReq extends Request = Request>(
    handler: (req: TReq, res: Response, next: NextFunction) => Promise<unknown>,
  ): RequestHandler {
    return (req, res, next) => {
      handler(req as TReq, res, next).catch(next);
    };
  },
});
