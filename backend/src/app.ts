import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Express } from 'express';
import { Config } from './config/index.config.js';
import { ErrorMiddleware, RequestLogMiddleware } from './middlewares/index.middlewares.js';
import { ApiRouter } from './routes/index.routes.js';

/**
 * Builds the Express application. Kept free of side effects — no listening, no database
 * connection, no timers — so it can be constructed in a test without booting a daemon.
 */
export function createApp(): Express {
  const app = express();

  // Behind a reverse proxy in the only deployment that matters (a dev machine), so trust
  // exactly one hop for correct client addresses in logs.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: [...Config.http.corsOrigins],
      credentials: false,
    }),
  );
  app.use(express.json({ limit: Config.http.bodyLimit }));
  app.use(RequestLogMiddleware.handle());

  app.use(ApiRouter.build());

  app.use(ErrorMiddleware.notFound());
  app.use(ErrorMiddleware.handle());

  return app;
}
