import { pino } from 'pino';
import { AppMeta, Config } from '../config/index.config.js';

/**
 * Single logger instance for the process. Child loggers are created per module so
 * every line carries its origin without the call site repeating the field.
 */
const rootLogger = pino({
  level: Config.log.level,
  base: { service: AppMeta.SERVICE },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    remove: true,
  },
  ...(Config.log.pretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' },
        },
      }
    : {}),
});

export const Logger = Object.freeze({
  /** Namespaced child logger, e.g. `Logger.for('scanner')`. */
  for(module: string) {
    return rootLogger.child({ module });
  },

  root() {
    return rootLogger;
  },
});

export type ModuleLogger = ReturnType<typeof Logger.for>;
