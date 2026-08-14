import { BrowseDefaults, ScanSource } from '@leviosa/shared';
import { Config, ScanProtocol, Sidecar } from '../config/index.config.js';
import { SidecarRunner } from '../docker/index.docker.js';
import { ApiErrors, Logger } from '../utils/index.utils.js';
import type { RawListing } from '../types/internal.types.js';
import { ScanParser } from './scan.parser.js';
import type { ParsedScan } from './scan.parser.js';
import { ScanScript } from './scan.script.js';
import type { MeasureOutcome, ScanStrategy, StrategyTarget } from './scan.strategy.js';

const log = Logger.for('scanner:sidecar');

/** stderr can be long; only a prefix is worth surfacing in an error message. */
const STDERR_EXCERPT_LENGTH = 400;

function _buildEnv(mode: string, path: string): Record<string, string> {
  const { Env } = ScanProtocol;
  return {
    [Env.ROOT]: Sidecar.MOUNT_TARGET,
    [Env.PATH]: path,
    [Env.MODE]: mode,
    [Env.WITH_LAST_WRITE]: Config.scan.withLastWrite ? '1' : '0',
    [Env.MAX_ENTRIES]: String(Config.scan.browseMaxEntries),
  };
}

async function _probe(target: StrategyTarget, mode: string, path: string): Promise<ParsedScan> {
  const result = await SidecarRunner.run(target.host, {
    volumeName: target.volumeName,
    script: ScanScript.build(),
    env: _buildEnv(mode, path),
    timeoutMs: Config.scan.timeoutMs,
  });

  if (result.timedOut) {
    throw ApiErrors.scanTimeout(target.volumeName, Config.scan.timeoutMs);
  }

  const parsed = ScanParser.parse(result.stdout);

  if (parsed.error === ScanProtocol.Error.OUTSIDE_ROOT) {
    throw ApiErrors.pathTraversal(path);
  }
  if (parsed.error === ScanProtocol.Error.NOT_A_DIRECTORY) {
    throw ApiErrors.pathNotFound(target.volumeName, path);
  }

  if (!parsed.completed) {
    const excerpt = result.stderr.slice(0, STDERR_EXCERPT_LENGTH).trim();
    log.warn(
      { volume: target.volumeName, exitCode: result.exitCode, stderr: excerpt },
      'probe did not reach its completion sentinel',
    );
    throw ApiErrors.scanFailed(
      target.volumeName,
      excerpt.length > 0 ? excerpt : `probe exited with code ${String(result.exitCode)}`,
    );
  }

  return parsed;
}

/**
 * Measures a volume from inside a throwaway container with the volume bind-mounted
 * read-only.
 *
 * This is the portable strategy and the default: it is the only one that works on
 * Docker Desktop (where the storage root lives inside a VM), on rootless daemons,
 * against a remote DOCKER_HOST, and without this process holding root on the host.
 */
export const SidecarStrategy: ScanStrategy = Object.freeze({
  source: ScanSource.SIDECAR,

  async isUsable(): Promise<boolean> {
    // Usable wherever the daemon can start a container, which is a precondition for
    // the daemon being useful at all. Image availability is validated per run.
    return true;
  },

  async measure(target: StrategyTarget): Promise<MeasureOutcome> {
    const startedAt = Date.now();
    const parsed = await _probe(target, ScanProtocol.Mode.MEASURE, BrowseDefaults.ROOT_PATH);

    return {
      measurement: {
        totalBytes: parsed.totalBytes,
        fileCount: parsed.fileCount,
        directoryCount: parsed.directoryCount,
        lastWriteAtMs: parsed.lastWriteAtMs,
        source: ScanSource.SIDECAR,
        durationMs: Date.now() - startedAt,
        truncated: parsed.truncated,
      },
      entries: parsed.entries,
    };
  },

  async list(target: StrategyTarget, path: string): Promise<RawListing> {
    const parsed = await _probe(target, ScanProtocol.Mode.LIST, path);
    return { entries: parsed.entries, truncated: parsed.truncated };
  },
});
