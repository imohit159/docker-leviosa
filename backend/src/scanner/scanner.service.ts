import { constants as fsConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { MillisIn, ScanSource } from '@leviosa/shared';
import { CacheKey, Config, DOCKER_VOLUMES_DIRNAME } from '../config/index.config.js';
import type { HostContext } from '../docker/index.docker.js';
import { Logger, TtlCache } from '../utils/index.utils.js';
import type { RawListing, StrategyDecision } from '../types/internal.types.js';
import { HostFsStrategy } from './host-fs.strategy.js';
import { SidecarStrategy } from './sidecar.strategy.js';
import type { MeasureOutcome, ScanStrategy, StrategyTarget } from './scan.strategy.js';

const log = Logger.for('scanner');

const STRATEGY_CACHE_MS = 5 * MillisIn.MINUTE;
const strategyCache = TtlCache.create<StrategyDecision>(STRATEGY_CACHE_MS);

/**
 * Ordered by preference: the direct filesystem walk is cheaper when it is possible
 * at all, and the sidecar is the universal fallback.
 */
const LOCAL_STRATEGIES: readonly ScanStrategy[] = Object.freeze([HostFsStrategy, SidecarStrategy]);

/**
 * Remote hosts get the sidecar and nothing else.
 *
 * `HostFsStrategy` is withheld structurally rather than left to its own `isUsable`
 * check, so that a remote host cannot reach the local-filesystem path even if that
 * check were later loosened. Two independent gates for a failure whose symptom is
 * plausible-looking wrong numbers rather than an error.
 */
const REMOTE_STRATEGIES: readonly ScanStrategy[] = Object.freeze([SidecarStrategy]);

function _strategiesFor(host: HostContext): readonly ScanStrategy[] {
  return host.isLocal ? LOCAL_STRATEGIES : REMOTE_STRATEGIES;
}

/**
 * Facade over the measurement strategies. Callers never pick a backend; they hand
 * over a volume and get numbers back, with the strategy resolved per volume because
 * readability of the mountpoint is a per-host, per-permission concern.
 */
export const ScannerService = Object.freeze({
  async resolveStrategy(target: StrategyTarget): Promise<ScanStrategy> {
    for (const strategy of _strategiesFor(target.host)) {
      if (await strategy.isUsable(target)) {
        return strategy;
      }
    }
    // Unreachable in practice: the sidecar strategy always reports itself usable.
    return SidecarStrategy;
  },

  async measure(target: StrategyTarget): Promise<MeasureOutcome> {
    const strategy = await ScannerService.resolveStrategy(target);
    log.debug(
      { volume: target.volumeName, hostId: target.host.hostId, strategy: strategy.source },
      'measuring volume',
    );
    return strategy.measure(target);
  },

  async list(target: StrategyTarget, path: string): Promise<RawListing> {
    const strategy = await ScannerService.resolveStrategy(target);
    return strategy.list(target, path);
  },

  /**
   * Reports which strategy this host will use and why, so the UI can explain that
   * measurements run in a container rather than looking like an unexplained delay.
   */
  async describeStrategy(host: HostContext): Promise<StrategyDecision> {
    return strategyCache.resolve(CacheKey.for(host.hostId, CacheKey.SCAN_STRATEGY), async () => {
      if (!host.isLocal) {
        return {
          source: ScanSource.SIDECAR,
          reason:
            `${host.label} is reached over SSH, so volumes are measured inside a throwaway` +
            ' container on that machine rather than read from this one.',
        };
      }

      if (!Config.scan.allowHostFs) {
        return {
          source: ScanSource.SIDECAR,
          reason: 'Direct host filesystem access is disabled by configuration (SCAN_ALLOW_HOST_FS).',
        };
      }

      const info = await host.info();
      const root = info?.DockerRootDir;
      if (!root) {
        return {
          source: ScanSource.SIDECAR,
          reason: 'The daemon did not report a storage root, so it is assumed to be remote or virtualised.',
        };
      }

      const volumesDir = join(root, DOCKER_VOLUMES_DIRNAME);
      try {
        await access(volumesDir, fsConstants.R_OK | fsConstants.X_OK);
        return {
          source: ScanSource.HOST_FS,
          reason: `${volumesDir} is readable by this process, so volumes are measured in-process.`,
        };
      } catch {
        return {
          source: ScanSource.SIDECAR,
          reason:
            `${volumesDir} is not readable by uid ${String(process.getuid?.() ?? -1)}, ` +
            'so volumes are measured inside a throwaway container instead.',
        };
      }
    });
  },
});
