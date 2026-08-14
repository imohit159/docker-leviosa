import type { Server } from 'node:http';
import process from 'node:process';
import { AppMeta, Config } from './config/index.config.js';
import { HostRegistry, SidecarRunner } from './docker/index.docker.js';
import { SnapshotScheduler } from './scheduler/index.scheduler.js';
import { SqliteClient } from './store/index.store.js';
import { Logger } from './utils/index.utils.js';
import { createApp } from './app.js';

const log = Logger.for('server');

const SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = Object.freeze(['SIGINT', 'SIGTERM']);

let shuttingDown = false;

/** Best-effort stray sweep per host. Failures are logged by the runner and ignored. */
async function _reapStraysEverywhere(): Promise<void> {
  await Promise.allSettled(HostRegistry.enabled().map(async (host) => SidecarRunner.reapStrays(host)));
}

/**
 * Boot order matters: state first, then the daemon probe, then background work, and the
 * listener last, so nothing can serve a request against half-initialised state.
 */
async function bootstrap(): Promise<Server> {
  SqliteClient.connect();

  const local = HostRegistry.bootstrap();
  const reachable = await local.ping();
  if (!reachable) {
    log.error(
      { endpoint: local.endpointDescription },
      'Local Docker daemon is unreachable. The API will start and report degraded health.',
    );
  }

  // Fire-and-forget across every host: a previous process may have died mid-scan and
  // its sidecars are ours to clean up, but an unreachable VPS must not hold up the
  // listener while it waits out a connect timeout.
  void _reapStraysEverywhere();

  SnapshotScheduler.start();

  const app = createApp();
  return new Promise<Server>((resolveServer) => {
    const server = app.listen(Config.http.port, Config.http.host, () => {
      log.info(
        {
          name: AppMeta.NAME,
          url: `http://${Config.http.host}:${String(Config.http.port)}`,
          env: Config.env,
          daemonReachable: reachable,
        },
        'listening',
      );
      resolveServer(server);
    });
  });
}

/**
 * Drains in-flight requests, stops timers and closes the database. The grace period is
 * bounded because a scan can legitimately outlive it, and hanging on shutdown is worse
 * than abandoning a measurement that will simply be retaken.
 */
function installShutdownHooks(server: Server): void {
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log.info({ signal }, 'shutting down');

    const forceExit = setTimeout(() => {
      log.warn({ graceMs: Config.http.shutdownGraceMs }, 'grace period elapsed; exiting now');
      process.exit(1);
    }, Config.http.shutdownGraceMs);
    forceExit.unref();

    SnapshotScheduler.stop();
    server.close(() => {
      HostRegistry.disposeAll();
      SqliteClient.close();
      clearTimeout(forceExit);
      log.info('shutdown complete');
      process.exit(0);
    });
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, shutdown);
  }

  process.on('unhandledRejection', (reason) => {
    log.error({ err: reason }, 'unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    log.fatal({ err: error }, 'uncaught exception; exiting');
    process.exit(1);
  });
}

bootstrap()
  .then(installShutdownHooks)
  .catch((error: unknown) => {
    log.fatal({ err: error }, 'failed to start');
    process.exit(1);
  });
