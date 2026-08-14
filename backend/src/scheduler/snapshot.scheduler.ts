import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { MillisIn } from '@leviosa/shared';
import { Config } from '../config/index.config.js';
import { HostRegistry, VolumeRepository } from '../docker/index.docker.js';
import type { HostContext } from '../docker/index.docker.js';
import { ScanQueue } from '../queue/index.queue.js';
import { MeasurementRepository } from '../store/index.store.js';
import { Bytes, Clock, Logger } from '../utils/index.utils.js';
import { SightingService } from '../services/index.services.js';

const log = Logger.for('scheduler');

let snapshotTask: ScheduledTask | null = null;
let sightingTimer: NodeJS.Timeout | null = null;
/** Guards against a slow snapshot round overlapping the next tick. */
let snapshotRunning = false;

/**
 * Re-measures every volume and trims history beyond the retention window.
 *
 * This is what makes growth history possible: a size figure is only interesting
 * relative to yesterday's, and nothing else in the stack records one. Scans go through
 * the same bounded queue as user-triggered ones, so a nightly sweep cannot starve an
 * interactive request of daemon IO.
 */
interface HostSnapshotOutcome {
  hostId: string;
  volumes: number;
  measured: number;
  totalBytes: number;
}

/**
 * Runs a task against every enabled host, at most `sweepConcurrency` at a time.
 *
 * Bounded rather than a plain `Promise.all` because each host may hold open an SSH
 * connection and a container, and a fleet of twenty would otherwise all be contacted at
 * once on the same tick. Rejections are swallowed per host by the caller's own
 * try/catch, so one dead machine cannot abort the sweep for the rest.
 */
async function _forEachHost<TResult>(
  task: (host: HostContext) => Promise<TResult>,
): Promise<PromiseSettledResult<TResult>[]> {
  const hosts = HostRegistry.enabled();
  const results: PromiseSettledResult<TResult>[] = [];

  for (let index = 0; index < hosts.length; index += Config.hosts.sweepConcurrency) {
    const batch = hosts.slice(index, index + Config.hosts.sweepConcurrency);
    results.push(...(await Promise.allSettled(batch.map(task))));
  }

  return results;
}

async function _snapshotHost(host: HostContext): Promise<HostSnapshotOutcome> {
  const volumes = await VolumeRepository.listAll(host);
  const outcomes = await Promise.allSettled(volumes.map(async (volume) => ScanQueue.run(host, volume.name)));

  const measured = outcomes.filter((outcome) => outcome.status === 'fulfilled');
  const totalBytes = measured.reduce(
    (sum, outcome) => sum + (outcome.status === 'fulfilled' ? outcome.value.totalBytes : 0),
    0,
  );

  return { hostId: host.hostId, volumes: volumes.length, measured: measured.length, totalBytes };
}

async function _runSnapshot(): Promise<void> {
  if (snapshotRunning) {
    log.warn('previous snapshot round is still running; skipping this tick');
    return;
  }

  snapshotRunning = true;
  const startedAt = Clock.nowMs();

  try {
    const outcomes = await _forEachHost(async (host) => {
      try {
        return await _snapshotHost(host);
      } catch (error) {
        log.warn({ err: error, hostId: host.hostId }, 'snapshot skipped for host');
        throw error;
      }
    });

    const succeeded = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const totals = succeeded.reduce(
      (sum, outcome) => {
        const value = outcome.status === 'fulfilled' ? outcome.value : null;
        return {
          volumes: sum.volumes + (value?.volumes ?? 0),
          measured: sum.measured + (value?.measured ?? 0),
          totalBytes: sum.totalBytes + (value?.totalBytes ?? 0),
        };
      },
      { volumes: 0, measured: 0, totalBytes: 0 },
    );

    // Retention is global: the query keeps the newest row per (host, volume), so a
    // single sweep is correct and avoids re-scanning the table once per host.
    MeasurementRepository.pruneOlderThan(Clock.daysAgoMs(Config.database.retentionDays));

    log.info(
      {
        hosts: outcomes.length,
        hostsFailed: outcomes.length - succeeded.length,
        volumes: totals.volumes,
        measured: totals.measured,
        totalBytes: Bytes.format(totals.totalBytes),
        durationMs: Clock.nowMs() - startedAt,
      },
      'snapshot round complete',
    );
  } catch (error) {
    log.error({ err: error }, 'snapshot round failed');
  } finally {
    snapshotRunning = false;
  }
}

async function _refreshSightings(): Promise<void> {
  await _forEachHost(async (host) => {
    try {
      await SightingService.refresh(host);
    } catch (error) {
      // A briefly unreachable daemon is not worth escalating; the next tick retries.
      log.debug({ err: error, hostId: host.hostId }, 'sighting refresh skipped');
    }
  });
}

export const SnapshotScheduler = Object.freeze({
  start(): void {
    void _refreshSightings();
    sightingTimer = setInterval(() => {
      void _refreshSightings();
    }, Config.scheduler.sightingIntervalMs);

    log.info(
      { intervalMinutes: Config.scheduler.sightingIntervalMs / MillisIn.MINUTE },
      'attachment ledger polling started',
    );

    if (!Config.scheduler.snapshotEnabled) {
      log.warn('periodic size snapshots are disabled; growth history will only fill from manual scans');
      return;
    }

    if (!cron.validate(Config.scheduler.snapshotCron)) {
      log.error({ expression: Config.scheduler.snapshotCron }, 'invalid SNAPSHOT_CRON; snapshots disabled');
      return;
    }

    snapshotTask = cron.schedule(Config.scheduler.snapshotCron, () => {
      void _runSnapshot();
    });

    log.info({ expression: Config.scheduler.snapshotCron }, 'periodic size snapshots scheduled');
  },

  /** Exposed so an operator can force a round without waiting for the cron tick. */
  async runNow(): Promise<void> {
    await _runSnapshot();
  },

  stop(): void {
    if (sightingTimer) {
      clearInterval(sightingTimer);
      sightingTimer = null;
    }
    void snapshotTask?.stop();
    snapshotTask = null;
  },
});
