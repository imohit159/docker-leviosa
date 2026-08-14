import Docker from 'dockerode';
import { Config, DockerErrno, UNREACHABLE_SYSCALL_CODES } from '../config/index.config.js';
import { ApiError, ApiErrors, Logger } from '../utils/index.utils.js';

const log = Logger.for('docker-client');

const TCP_SCHEMES = new Set(['tcp:', 'http:', 'https:']);
const UNIX_SCHEME = 'unix:';
/**
 * Windows named pipes are matched as a raw prefix rather than parsed as a URL. `new
 * URL('npipe:////./pipe/docker_engine')` normalises the `/.` segment away and reports
 * its pathname as `//pipe/docker_engine`, which is a different, nonexistent pipe — so
 * URL parsing cannot be used on this scheme at all.
 */
const NPIPE_PREFIX = 'npipe://';
const DEFAULT_TLS_PORT = 2376;
const DEFAULT_TCP_PORT = 2375;

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

function readDockerError(error: unknown): DockerodeError {
  return (error ?? {}) as DockerodeError;
}

/**
 * Transport-agnostic Docker helpers.
 *
 * This module used to own a single `new Docker(...)` created at import time, which made
 * "which daemon" an unaskable question. The handles now live on a `HostContext` each;
 * what remains here is the option parsing for the local daemon and the error
 * translation, both of which are the same whatever the transport.
 */
export const DockerClient = Object.freeze({
  /**
   * Connection options for the daemon this process reaches directly.
   *
   * Honours DOCKER_HOST so the local host can be a rootless socket, Docker Desktop or a
   * TCP endpoint without code changes; falls back to the platform's conventional socket.
   */
  localOptions(): Docker.DockerOptions {
    const base = { timeout: Config.docker.timeoutMs } satisfies Docker.DockerOptions;
    const host = Config.docker.host;

    if (!host) {
      return { ...base, socketPath: Config.docker.socketPath };
    }

    if (host.startsWith(NPIPE_PREFIX)) {
      return { ...base, socketPath: host.slice(NPIPE_PREFIX.length) };
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
          port: Number(url.port) || (url.protocol === 'https:' ? DEFAULT_TLS_PORT : DEFAULT_TCP_PORT),
          protocol: url.protocol === 'https:' ? 'https' : 'http',
        };
      }
    } catch {
      log.warn({ host }, 'DOCKER_HOST is not a parseable URL; treating it as a socket path');
    }

    return { ...base, socketPath: host };
  },

  /**
   * Converts a dockerode rejection into an `ApiError`. Socket-level failures become
   * DOCKER_UNAVAILABLE (a 503, retryable); everything else keeps the daemon's own
   * message so operators are not left guessing.
   *
   * `endpointDescription` is threaded in rather than captured at module load, because
   * "the daemon is unreachable" and "you are pointed at the wrong endpoint" produce
   * identical symptoms, and with several hosts the answer differs per host.
   */
  toApiError(error: unknown, context: string, endpointDescription: string): ApiError {
    if (ApiError.isApiError(error)) {
      return error;
    }

    const details = readDockerError(error);
    const syscall = details.code;

    if (syscall && UNREACHABLE_SYSCALL_CODES.includes(syscall)) {
      return ApiErrors.dockerUnavailable(
        `${syscall} while ${context}. Tried ${endpointDescription}. Check that the daemon is` +
          ' running and reachable by this user, or set DOCKER_HOST to point somewhere else.',
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
});
