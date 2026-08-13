import type { Container } from 'dockerode';
import { Config, Sidecar } from '../config/index.config.js';
import { ApiErrors, Identifier, Logger } from '../utils/index.utils.js';
import { DockerClient } from './docker.client.js';

const log = Logger.for('sidecar');

/** Docker multiplexes non-TTY logs into 8-byte framed chunks. */
const FRAME_HEADER_BYTES = 8;
const FRAME_SIZE_OFFSET = 4;
const STDERR_STREAM_TYPE = 2;
const VALID_STREAM_TYPES = new Set([0, 1, 2]);

export interface SidecarRunOptions {
  /** Volume bind-mounted read-only at `Sidecar.MOUNT_TARGET`. */
  volumeName: string;
  /** Shell program executed by `sh -c`. Must contain no caller-supplied data. */
  script: string;
  /** Values the script reads. This is the only channel for untrusted input. */
  env: Record<string, string>;
  timeoutMs: number;
}

export interface SidecarRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

/** One in-flight image check shared by every concurrent scan. */
let imageReady: Promise<void> | null = null;

/**
 * Splits a framed Docker log buffer into its stdout and stderr halves. Falls back
 * to treating the payload as raw stdout if it is not framed as expected, so a
 * daemon quirk degrades into noisy output rather than a crash.
 */
function _demultiplex(buffer: Buffer): { stdout: string; stderr: string } {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let offset = 0;

  while (offset + FRAME_HEADER_BYTES <= buffer.length) {
    const streamType = buffer[offset];
    if (streamType === undefined || !VALID_STREAM_TYPES.has(streamType)) {
      return { stdout: buffer.toString('utf8'), stderr: '' };
    }

    const payloadLength = buffer.readUInt32BE(offset + FRAME_SIZE_OFFSET);
    const start = offset + FRAME_HEADER_BYTES;
    const end = Math.min(start + payloadLength, buffer.length);
    const chunk = buffer.subarray(start, end);

    if (streamType === STDERR_STREAM_TYPE) {
      stderr.push(chunk);
    } else {
      stdout.push(chunk);
    }
    offset = end;
  }

  return {
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
  };
}

function _toEnvArray(env: Record<string, string>): string[] {
  return Object.entries(env).map(([key, value]) => `${key}=${value}`);
}

async function _createContainer(options: SidecarRunOptions): Promise<Container> {
  return DockerClient.raw().createContainer({
    name: `${Sidecar.NAME_PREFIX}-${Identifier.nameSuffix()}`,
    Image: Config.scan.image,
    Cmd: ['/bin/sh', '-c', options.script],
    Env: _toEnvArray(options.env),
    // Root plus CAP_DAC_READ_SEARCH: volume payloads are routinely owned by foreign
    // uids behind 0700 directories, and an unprivileged probe would silently
    // under-report their size.
    User: Sidecar.USER,
    Tty: false,
    AttachStdout: true,
    AttachStderr: true,
    NetworkDisabled: true,
    WorkingDir: '/',
    Labels: {
      [Sidecar.OWNER_LABEL]: Sidecar.OWNER_VALUE,
      [Sidecar.ROLE_LABEL]: Sidecar.ROLE_SCANNER,
    },
    HostConfig: {
      Binds: [`${options.volumeName}:${Sidecar.MOUNT_TARGET}:ro`],
      NetworkMode: Sidecar.NETWORK_MODE,
      // Reaped explicitly in `finally` instead: auto-removal races with reading logs.
      AutoRemove: false,
      ReadonlyRootfs: true,
      Memory: Sidecar.MEMORY_BYTES,
      PidsLimit: Sidecar.PIDS_LIMIT,
      CapDrop: ['ALL'],
      CapAdd: ['DAC_READ_SEARCH'],
      SecurityOpt: ['no-new-privileges'],
    },
  });
}

async function _waitWithBudget(
  container: Container,
  timeoutMs: number,
): Promise<{ exitCode: number | null; timedOut: boolean }> {
  let timer: NodeJS.Timeout | undefined;
  const settled = container.wait();

  const budget = new Promise<'timeout'>((resolveBudget) => {
    timer = setTimeout(() => resolveBudget('timeout'), timeoutMs);
  });

  try {
    const outcome = await Promise.race([settled, budget]);
    if (outcome === 'timeout') {
      await container.kill({ signal: Sidecar.KILL_SIGNAL }).catch(() => undefined);
      await settled.catch(() => undefined);
      return { exitCode: null, timedOut: true };
    }
    return { exitCode: (outcome as { StatusCode?: number }).StatusCode ?? null, timedOut: false };
  } finally {
    clearTimeout(timer);
  }
}

export const SidecarRunner = Object.freeze({
  /**
   * Guarantees the scanner image exists locally, pulling once if allowed. Concurrent
   * callers share a single check so a burst of scans cannot trigger parallel pulls.
   */
  async ensureImage(): Promise<void> {
    imageReady ??= (async () => {
      const docker = DockerClient.raw();
      try {
        await docker.getImage(Config.scan.image).inspect();
        return;
      } catch (error) {
        if (!DockerClient.isNotFound(error)) {
          throw DockerClient.toApiError(error, `inspecting scanner image "${Config.scan.image}"`);
        }
      }

      if (!Config.scan.autoPull) {
        throw ApiErrors.scanImageUnavailable(Config.scan.image);
      }

      log.info({ image: Config.scan.image }, 'pulling scanner image');
      try {
        const stream = await docker.pull(Config.scan.image);
        await new Promise<void>((resolvePull, rejectPull) => {
          docker.modem.followProgress(stream, (error) => (error ? rejectPull(error) : resolvePull()));
        });
      } catch (error) {
        throw ApiErrors.scanImageUnavailable(Config.scan.image, error);
      }
    })().catch((error: unknown) => {
      // Never cache a failed check: the operator may fix connectivity and retry.
      imageReady = null;
      throw error;
    });

    return imageReady;
  },

  /**
   * Runs the probe against one volume and returns its output. The container is
   * always removed, including on timeout, so a failed scan leaves nothing behind.
   */
  async run(options: SidecarRunOptions): Promise<SidecarRunResult> {
    await SidecarRunner.ensureImage();

    const startedAt = Date.now();
    let container: Container | null = null;

    try {
      container = await _createContainer(options);
      await container.start();

      const { exitCode, timedOut } = await _waitWithBudget(container, options.timeoutMs);

      const raw = (await container.logs({ stdout: true, stderr: true, follow: false })) as unknown as Buffer;
      const { stdout, stderr } = _demultiplex(Buffer.from(raw));

      return { stdout, stderr, exitCode, timedOut, durationMs: Date.now() - startedAt };
    } catch (error) {
      throw DockerClient.toApiError(error, `running the scanner against volume "${options.volumeName}"`);
    } finally {
      if (container) {
        await container.remove({ force: true, v: false }).catch((error: unknown) => {
          log.warn({ err: error, containerId: container?.id }, 'failed to remove sidecar container');
        });
      }
    }
  },

  /**
   * Removes sidecars left behind by a previous process that died mid-scan. Called
   * once at boot; identified purely by our own ownership label.
   */
  async reapStrays(): Promise<number> {
    try {
      const strays = await DockerClient.raw().listContainers({
        all: true,
        filters: { label: [`${Sidecar.OWNER_LABEL}=${Sidecar.OWNER_VALUE}`] },
      });

      let reaped = 0;
      for (const stray of strays) {
        await DockerClient.raw()
          .getContainer(stray.Id)
          .remove({ force: true, v: false })
          .then(() => {
            reaped += 1;
          })
          .catch((error: unknown) => {
            log.warn({ err: error, containerId: stray.Id }, 'failed to reap stray sidecar');
          });
      }

      if (reaped > 0) {
        log.info({ reaped }, 'reaped stray sidecar containers from a previous run');
      }
      return reaped;
    } catch (error) {
      log.warn({ err: error }, 'stray sidecar sweep skipped');
      return 0;
    }
  },
});
