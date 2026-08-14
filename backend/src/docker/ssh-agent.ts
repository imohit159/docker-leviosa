import { readFile } from 'node:fs/promises';
import { Agent as HttpAgent } from 'node:http';
import type { ClientRequestArgs } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { Client } from 'ssh2';
import type { ConnectConfig } from 'ssh2';
import { Config, SshTransport } from '../config/index.config.js';
import { Logger } from '../utils/index.utils.js';
import { KnownHosts } from './known-hosts.util.js';

const log = Logger.for('ssh:agent');

/** Keepalive probes tolerated before the connection is declared dead. */
const KEEPALIVE_COUNT_MAX = 3;

/** Operators type `~/.ssh/...`; Node's readFile does not expand that itself. */
function _resolveKeyPath(keyPath: string): string {
  if (keyPath === '~') {
    return homedir();
  }
  if (keyPath.startsWith('~/')) {
    return join(homedir(), keyPath.slice(2));
  }
  return keyPath;
}

/**
 * How a channel to the remote daemon is opened.
 *
 * Resolved once per connection and then reused, because the answer is a property of
 * the remote machine and re-deciding per request would cost a wasted channel each time.
 */
const ChannelMode = Object.freeze({
  /**
   * OpenSSH unix-socket forwarding straight to the daemon socket. Preferred: it is a
   * pure SSH channel, whereas the stdio proxy forks a `docker` process on the remote
   * for every single HTTP request.
   */
  STREAM_LOCAL: 'stream-local',
  /** The Engine's own stdio proxy. Needs the docker CLI present on the remote. */
  DIAL_STDIO: 'dial-stdio',
} as const);
type ChannelMode = (typeof ChannelMode)[keyof typeof ChannelMode];

export interface SshEndpoint {
  hostId: string;
  host: string;
  port: number;
  user: string;
  /** Path to a private key, or null to authenticate through the SSH agent. */
  keyPath: string | null;
  /** Fingerprint the operator has already accepted, if any. */
  expectedFingerprint: string | null;
}

/** Why a connection attempt failed, in terms the host probe can classify. */
export const SshFailure = Object.freeze({
  UNVERIFIED_HOST_KEY: 'UNVERIFIED_HOST_KEY',
  AUTH_REJECTED: 'AUTH_REJECTED',
  UNREACHABLE: 'UNREACHABLE',
  NO_CHANNEL: 'NO_CHANNEL',
} as const);
export type SshFailure = (typeof SshFailure)[keyof typeof SshFailure];

export class SshConnectionError extends Error {
  readonly kind: SshFailure;
  /** Key the remote presented, when the failure was that we did not trust it. */
  readonly presentedFingerprint: string | null;

  constructor(kind: SshFailure, message: string, presentedFingerprint: string | null = null) {
    super(message);
    this.name = 'SshConnectionError';
    this.kind = kind;
    this.presentedFingerprint = presentedFingerprint;
  }
}

/**
 * Node's HTTP client calls socket methods an SSH channel does not implement. ssh2 does
 * the same patching in its own agent; without it the first request throws inside
 * `http`, far from anything that names SSH.
 */
function _asSocket(stream: Duplex): Duplex {
  const noop = (): void => undefined;
  return Object.assign(stream, {
    setKeepAlive: noop,
    setNoDelay: noop,
    setTimeout: noop,
    ref: noop,
    unref: noop,
    destroySoon: stream.destroy.bind(stream),
  });
}

/**
 * An `http.Agent` that multiplexes Engine API calls over one persistent SSH connection.
 *
 * This exists because both `docker-modem` and ssh2's own `SSHTTPAgent` build a fresh
 * `ssh2.Client` inside `createConnection` and call `client.end()` when the response
 * stream closes. Every Engine call would then pay a TCP connect, a key exchange and an
 * authentication round trip — on a dashboard that issues a volume list, a container
 * inventory and a detail fetch per view, that is seconds of pure handshake. Here the
 * connection is opened once and each HTTP request costs only a new channel.
 */
export class PooledSshAgent extends HttpAgent {
  private readonly endpoint: SshEndpoint;
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;
  private channelMode: ChannelMode | null = null;
  /** Circuit breaker: epoch millis before which no attempt is worth making. */
  private refuseUntilMs = 0;
  private lastFingerprint: string | null = null;
  private lastError: SshConnectionError | null = null;

  constructor(endpoint: SshEndpoint) {
    // keepAlive false: one SSH channel per HTTP request is correct, and pooling the
    // channel would leave a half-read Engine response wired to the next request.
    super({ keepAlive: false, maxSockets: Infinity });
    this.endpoint = endpoint;
  }

  /** Fingerprint most recently presented by the remote, for the trust prompt. */
  presentedFingerprint(): string | null {
    return this.lastFingerprint;
  }

  failure(): SshConnectionError | null {
    return this.lastError;
  }

  /** Opens the connection if needed. Used by the probe, which wants the error itself. */
  async connect(): Promise<void> {
    await this._ensureClient();
  }

  override destroy(): void {
    this.client?.end();
    this.client = null;
    this.connecting = null;
    this.channelMode = null;
    super.destroy();
  }

  /**
   * Always asynchronous, so the socket arrives through the callback and this returns
   * nothing. Node supports both forms; opening an SSH channel cannot be done inline.
   */
  override createConnection(
    _options: ClientRequestArgs,
    callback?: (error: Error | null, stream: Duplex) => void,
  ): Duplex | null | undefined {
    if (callback === undefined) {
      throw new SshConnectionError(
        SshFailure.NO_CHANNEL,
        'SSH transport requires the asynchronous createConnection callback.',
      );
    }

    if (Date.now() < this.refuseUntilMs) {
      // Fail immediately rather than letting every request sit through the full Docker
      // timeout: one unreachable host must not make the whole dashboard feel hung.
      callback(
        this.lastError ?? new SshConnectionError(SshFailure.UNREACHABLE, 'host is temporarily unreachable'),
        null as unknown as Duplex,
      );
      return undefined;
    }

    this._ensureClient()
      .then(async (client) => _asSocket(await this._openChannel(client)))
      .then((stream) => {
        callback(null, stream);
      })
      .catch((error: unknown) => {
        callback(error instanceof Error ? error : new Error(String(error)), null as unknown as Duplex);
      });

    return undefined;
  }

  private async _ensureClient(): Promise<Client> {
    if (this.client) {
      return this.client;
    }
    this.connecting ??= this._openClient();

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async _buildConnectConfig(): Promise<ConnectConfig> {
    const base: ConnectConfig = {
      host: this.endpoint.host,
      port: this.endpoint.port,
      username: this.endpoint.user,
      readyTimeout: Config.ssh.connectTimeoutMs,
      keepaliveInterval: Config.ssh.keepaliveMs,
      keepaliveCountMax: KEEPALIVE_COUNT_MAX,
      hostVerifier: (key: Buffer, verify: (valid: boolean) => void) => {
        void this._verifyHostKey(key).then(verify);
      },
    };

    if (this.endpoint.keyPath === null) {
      if (Config.ssh.authSock === null) {
        throw new SshConnectionError(
          SshFailure.AUTH_REJECTED,
          'No key path is configured for this host and no SSH agent is available' +
            ' (SSH_AUTH_SOCK is unset in the API process).',
        );
      }
      return { ...base, agent: Config.ssh.authSock };
    }

    try {
      return { ...base, privateKey: await readFile(_resolveKeyPath(this.endpoint.keyPath)) };
    } catch {
      // Deliberately says nothing about the path or the contents: this message reaches
      // the API response, and a readable key is exactly the thing not to describe.
      throw new SshConnectionError(
        SshFailure.AUTH_REJECTED,
        'The configured private key could not be read. Check the path and its permissions.',
      );
    }
  }

  /**
   * Trust-on-first-use, refusing by default.
   *
   * ssh2 accepts any key when no verifier is supplied, which would make a
   * machine-in-the-middle indistinguishable from the real host — unacceptable for a
   * tool that can delete volumes. A pinned fingerprint wins outright; otherwise the key
   * must already be in `known_hosts`. Anything else is refused and surfaced so the
   * operator can accept it deliberately.
   */
  private async _verifyHostKey(key: Buffer): Promise<boolean> {
    const presented = KnownHosts.fingerprintOf(key);
    this.lastFingerprint = presented;

    if (this.endpoint.expectedFingerprint !== null) {
      if (this.endpoint.expectedFingerprint === presented) {
        return true;
      }
      this.lastError = new SshConnectionError(
        SshFailure.UNVERIFIED_HOST_KEY,
        'The host key does not match the fingerprint pinned for this host. This is either a' +
          ' reinstalled server or a machine-in-the-middle; confirm the new key before continuing.',
        presented,
      );
      return false;
    }

    const trusted = await KnownHosts.fingerprintsFor(this.endpoint.host, this.endpoint.port);
    if (trusted.includes(presented)) {
      return true;
    }

    this.lastError = new SshConnectionError(
      SshFailure.UNVERIFIED_HOST_KEY,
      trusted.length === 0
        ? 'This host key is not in known_hosts and no fingerprint has been pinned yet.'
        : 'This host key differs from every key known_hosts holds for this address.',
      presented,
    );
    return false;
  }

  private async _openClient(): Promise<Client> {
    const config = await this._buildConnectConfig();

    return new Promise<Client>((resolve, reject) => {
      const client = new Client();

      const fail = (error: SshConnectionError): void => {
        this.lastError = error;
        this.refuseUntilMs = Date.now() + Config.hosts.unreachableBackoffMs;
        this.client = null;
        this.channelMode = null;
        client.end();
        reject(error);
      };

      client
        .once('ready', () => {
          this.client = client;
          this.lastError = null;
          this.refuseUntilMs = 0;
          log.info({ hostId: this.endpoint.hostId }, 'ssh connection established');
          resolve(client);
        })
        .once('error', (error: NodeJS.ErrnoException) => {
          fail(this._classify(error));
        })
        .once('close', () => {
          // Drop the handle so the next request reconnects rather than writing into a
          // dead socket. Not a failure by itself: idle connections are closed routinely.
          if (this.client === client) {
            this.client = null;
            this.channelMode = null;
            log.debug({ hostId: this.endpoint.hostId }, 'ssh connection closed');
          }
        });

      client.connect(config);
    });
  }

  /** Turns an ssh2 error into something the host probe can act on. */
  private _classify(error: NodeJS.ErrnoException): SshConnectionError {
    // A verifier rejection surfaces as a generic handshake error, so the specific
    // reason recorded during verification is the more useful one.
    if (this.lastError?.kind === SshFailure.UNVERIFIED_HOST_KEY) {
      return this.lastError;
    }

    const message = error.message || 'ssh connection failed';
    if (/authentication|privatekey|publickey|password|no matching/i.test(message)) {
      return new SshConnectionError(
        SshFailure.AUTH_REJECTED,
        `SSH authentication was rejected by ${this.endpoint.host}. ${message}`,
      );
    }

    return new SshConnectionError(
      SshFailure.UNREACHABLE,
      `Could not reach ${this.endpoint.host}:${String(this.endpoint.port)} over SSH. ${message}`,
    );
  }

  /**
   * One channel per HTTP request, over the connection already established.
   *
   * The transport is probed on first use and then remembered, so the fallback costs a
   * single wasted channel per connection rather than one per request.
   */
  private async _openChannel(client: Client): Promise<Duplex> {
    if (this.channelMode === ChannelMode.DIAL_STDIO) {
      return this._execDialStdio(client);
    }

    try {
      const stream = await this._forwardRemoteSocket(client);
      this.channelMode = ChannelMode.STREAM_LOCAL;
      return stream;
    } catch (error) {
      if (this.channelMode === ChannelMode.STREAM_LOCAL) {
        throw error;
      }
      log.info(
        { hostId: this.endpoint.hostId, err: error },
        'unix socket forwarding unavailable; falling back to the docker stdio proxy',
      );
      const stream = await this._execDialStdio(client);
      this.channelMode = ChannelMode.DIAL_STDIO;
      return stream;
    }
  }

  private async _forwardRemoteSocket(client: Client): Promise<Duplex> {
    return new Promise<Duplex>((resolve, reject) => {
      client.openssh_forwardOutStreamLocal(SshTransport.REMOTE_SOCKET_PATH, (error, stream) => {
        if (error) {
          reject(
            new SshConnectionError(
              SshFailure.NO_CHANNEL,
              `Could not forward ${SshTransport.REMOTE_SOCKET_PATH}: ${error.message}`,
            ),
          );
          return;
        }
        resolve(stream as unknown as Duplex);
      });
    });
  }

  private async _execDialStdio(client: Client): Promise<Duplex> {
    return new Promise<Duplex>((resolve, reject) => {
      client.exec(SshTransport.DIAL_STDIO_COMMAND, (error, stream) => {
        if (error) {
          reject(
            new SshConnectionError(
              SshFailure.NO_CHANNEL,
              `Neither socket forwarding nor "${SshTransport.DIAL_STDIO_COMMAND}" worked on this host.` +
                ` Confirm the login user can reach the Docker socket. ${error.message}`,
            ),
          );
          return;
        }
        resolve(stream as unknown as Duplex);
      });
    });
  }
}
