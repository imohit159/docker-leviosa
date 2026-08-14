import Docker from 'dockerode';
import { HostKind } from '@leviosa/shared';
import { Config, LOCAL_HOST_ID, SshTransport } from '../config/index.config.js';
import type { StoredHost } from '../store/index.store.js';
import type { ApiError } from '../utils/index.utils.js';
import { ApiErrors, Logger } from '../utils/index.utils.js';
import { DockerClient } from './docker.client.js';
import type { DaemonSystemInfo } from './docker.client.js';
import { PooledSshAgent, SshConnectionError, SshFailure } from './ssh-agent.js';

const log = Logger.for('docker:host');

/**
 * Placeholder authority for SSH-tunnelled requests.
 *
 * The agent ignores host and port entirely — it opens a channel to the remote daemon
 * socket — but `dockerode` still builds an HTTP request, and a request needs a Host
 * header. This value never reaches the network.
 */
const TUNNEL_AUTHORITY = Object.freeze({ HOST: 'docker', PORT: 2375 } as const);

/**
 * `agent` is honoured by docker-modem (`this.agent = opts.agent`, then set on every
 * request) but is missing from `@types/dockerode`. Declared here rather than cast away
 * at the call site so the gap is visible and typed.
 */
interface DockerOptionsWithAgent extends Docker.DockerOptions {
  agent?: PooledSshAgent;
}

/**
 * Everything needed to talk to one daemon.
 *
 * This replaces the module-level dockerode singleton. Every repository, scanner and
 * queue operation now takes a context explicitly rather than reaching for a shared
 * handle, which is what makes it impossible to issue a request without having said
 * which machine it is for.
 */
export interface HostContext {
  readonly hostId: string;
  readonly label: string;
  readonly kind: HostKind;
  /**
   * True only for the daemon this process reaches directly.
   *
   * Load-bearing: it is the sole gate on the host-filesystem scan strategy. A remote
   * daemon reports mountpoints like `/var/lib/docker/volumes/x/_data`, which very often
   * also exist and are readable on this machine, so a permission probe cannot tell the
   * two apart and would happily measure local bytes and file them under the VPS.
   */
  readonly isLocal: boolean;
  /** Where we are actually trying to reach the daemon, phrased for a human. */
  readonly endpointDescription: string;
  readonly docker: Docker;
  /** Present for SSH hosts, so a probe can report why a connection failed. */
  readonly sshAgent: PooledSshAgent | null;

  ping(): Promise<boolean>;
  info(): Promise<DaemonSystemInfo | null>;
  version(): Promise<{ version: string; apiVersion: string } | null>;
  toApiError(error: unknown, operation: string): ApiError;
  dispose(): void;
}

/**
 * Maps a transport failure onto the status a client should act on.
 *
 * Without this an unreachable VPS surfaces as a 500 DOCKER_ERROR, which reads as "the
 * API is broken" and is not retryable. The honest answer is 503: the service is fine,
 * the daemon behind it is not, and trying again later is exactly the right response.
 * A refused host key is neither — it is a 403 the operator must resolve deliberately.
 */
function _sshApiError(
  error: SshConnectionError,
  hostId: string,
  operation: string,
  endpoint: string,
): ApiError {
  if (error.kind === SshFailure.UNVERIFIED_HOST_KEY) {
    return ApiErrors.hostKeyUnverified(hostId, error.message, error.presentedFingerprint);
  }

  return ApiErrors.dockerUnavailable(
    `${error.message} (while ${operation}, over ${endpoint})`,
    error,
  );
}

function _describeLocalEndpoint(options: Docker.DockerOptions): string {
  return options.socketPath
    ? `socket ${options.socketPath}`
    : `${options.protocol ?? 'http'}://${String(options.host)}:${String(options.port)}`;
}

function _buildLocal(host: StoredHost): HostContext {
  const options = DockerClient.localOptions();
  const docker = new Docker(options);
  const endpointDescription = _describeLocalEndpoint(options);

  return _finish(host, docker, endpointDescription, null, true);
}

function _buildSsh(host: StoredHost): HostContext {
  if (host.ssh === null) {
    throw new Error(`host ${host.id} is marked as SSH but has no connection details`);
  }

  const agent = new PooledSshAgent({
    hostId: host.id,
    host: host.ssh.host,
    port: host.ssh.port,
    user: host.ssh.user,
    keyPath: host.ssh.keyPath,
    expectedFingerprint: host.hostKeyFingerprint,
  });

  /*
   * The agent, not an `ssh://` host, is the whole point. Handing dockerode an ssh URL
   * makes docker-modem build and tear down a complete SSH connection per Engine call;
   * this way the connection is pooled and each call is only a new channel.
   */
  const options: DockerOptionsWithAgent = {
    protocol: 'http',
    host: TUNNEL_AUTHORITY.HOST,
    port: TUNNEL_AUTHORITY.PORT,
    timeout: Config.docker.timeoutMs,
    agent,
  };
  const docker = new Docker(options);

  const endpointDescription = `ssh://${host.ssh.user}@${host.ssh.host}:${String(host.ssh.port)}` +
    ` (${SshTransport.REMOTE_SOCKET_PATH})`;

  return _finish(host, docker, endpointDescription, agent, false);
}

function _finish(
  host: StoredHost,
  docker: Docker,
  endpointDescription: string,
  sshAgent: PooledSshAgent | null,
  isLocal: boolean,
): HostContext {
  return Object.freeze({
    hostId: host.id,
    label: host.label,
    kind: host.kind,
    isLocal,
    endpointDescription,
    docker,
    sshAgent,

    async ping(): Promise<boolean> {
      try {
        await docker.ping();
        return true;
      } catch (error) {
        log.debug({ err: error, hostId: host.id }, 'daemon ping failed');
        return false;
      }
    },

    async info(): Promise<DaemonSystemInfo | null> {
      try {
        return (await docker.info()) as DaemonSystemInfo;
      } catch (error) {
        log.debug({ err: error, hostId: host.id }, 'daemon info failed');
        return null;
      }
    },

    async version(): Promise<{ version: string; apiVersion: string } | null> {
      try {
        const payload = await docker.version();
        return { version: payload.Version, apiVersion: payload.ApiVersion };
      } catch (error) {
        log.debug({ err: error, hostId: host.id }, 'daemon version failed');
        return null;
      }
    },

          toApiError(error: unknown, operation: string): ApiError {
            // The agent's own recorded failure is consulted as well as the thrown error:
            // a rejected host key surfaces from dockerode as a generic socket error, and
            // the specific reason only exists on the agent that refused it.
            const sshFailure =
              error instanceof SshConnectionError ? error : (sshAgent?.failure() ?? null);

            if (sshFailure !== null) {
              return _sshApiError(sshFailure, host.id, operation, endpointDescription);
            }
            return DockerClient.toApiError(error, operation, endpointDescription);
          },

    dispose(): void {
      sshAgent?.destroy();
    },
  });
}

export const HostContextFactory = Object.freeze({
  /** Builds the transport for a host. Connections are opened lazily on first use. */
  create(host: StoredHost): HostContext {
    return host.kind === HostKind.SSH ? _buildSsh(host) : _buildLocal(host);
  },

  isLocalId(hostId: string): boolean {
    return hostId === LOCAL_HOST_ID;
  },
});
