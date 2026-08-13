import Docker from 'dockerode';
import { Config, DockerErrno, UNREACHABLE_SYSCALL_CODES } from '../config/index.config.js';
import { ApiError, ApiErrors, Logger } from '../utils/index.utils.js';

const log = Logger.for('docker-client');

const TCP_SCHEMES = new Set(['tcp:', 'http:', 'https:']);
const UNIX_SCHEME = 'unix:';

/**
 * The subset of `/info` this service uses. Declared locally rather than leaning on the
 * dockerode typings, which model the endpoint loosely and vary between API versions.
 */
export interface DaemonSystemInfo {
  OperatingSystem?: string;
  DockerRootDir?: string;
  ServerVersion?: string;
}

interface DockerodeError {
  statusCode?: number;
  code?: string;
  message?: string;
  reason?: string;
  json?: { message?: string };
}

/**
 * Resolves connection options once at boot. Honours DOCKER_HOST so the API works
 * against a remote daemon, a rootless socket, or Docker Desktop without code
 * changes; falls back to the conventional unix socket.
 */
function buildOptions(): Docker.DockerOptions {
  const base = { timeout: Config.docker.timeoutMs } satisfies Docker.DockerOptions;
  const host = Config.docker.host;

  if (!host) {
    return { ...base, socketPath: Config.docker.socketPath };
  }

  try {
    const url = new URL(host);
    if (url.protocol === UNIX_SCHEME) {
      return { ...base, socketPath: url.pathname };
    }
    if (TCP_SCHEMES.has(url.protocol)) {
      return {
        ...base,
        host: url.hostname,
        port: Number(url.port) || (url.protocol === 'https:' ? 2376 : 2375),
        protocol: url.protocol === 'https:' ? 'https' : 'http',
      };
    }
  } catch {
    log.warn({ host }, 'DOCKER_HOST is not a parseable URL; treating it as a socket path');
  }

  return { ...base, socketPath: host };
}

const docker = new Docker(buildOptions());

function readDockerError(error: unknown): DockerodeError {
  return (error ?? {}) as DockerodeError;
}

export const DockerClient = Object.freeze({
  /** The raw dockerode handle. Only the repositories in this directory should use it. */
  raw(): Docker {
    return docker;
  },

  /**
   * Converts a dockerode rejection into an `ApiError`. Socket-level failures become
   * DOCKER_UNAVAILABLE (a 503, retryable); everything else keeps the daemon's own
   * message so operators are not left guessing.
   */
  toApiError(error: unknown, context: string): ApiError {
    if (ApiError.isApiError(error)) {
      return error;
    }

    const details = readDockerError(error);
    const syscall = details.code;

    if (syscall && UNREACHABLE_SYSCALL_CODES.includes(syscall)) {
      return ApiErrors.dockerUnavailable(
        `${syscall} while ${context}. Check that the daemon is running and that this user can access the socket.`,
        error,
      );
    }

    const message = details.json?.message ?? details.reason ?? details.message ?? 'unknown daemon error';
    return ApiErrors.dockerError(`Docker API failed while ${context}: ${message}`, error);
  },

  isNotFound(error: unknown): boolean {
    return readDockerError(error).statusCode === DockerErrno.NOT_FOUND;
  },

  isConflict(error: unknown): boolean {
    return readDockerError(error).statusCode === DockerErrno.CONFLICT;
  },

  /** Cheapest possible liveness probe against the Engine API. */
  async ping(): Promise<boolean> {
    try {
      await docker.ping();
      return true;
    } catch (error) {
      log.debug({ err: error }, 'daemon ping failed');
      return false;
    }
  },

  async info(): Promise<DaemonSystemInfo | null> {
    try {
      return (await docker.info()) as DaemonSystemInfo;
    } catch (error) {
      log.debug({ err: error }, 'daemon info failed');
      return null;
    }
  },

  async version(): Promise<{ version: string; apiVersion: string } | null> {
    try {
      const payload = await docker.version();
      return { version: payload.Version, apiVersion: payload.ApiVersion };
    } catch (error) {
      log.debug({ err: error }, 'daemon version failed');
      return null;
    }
  },
});
