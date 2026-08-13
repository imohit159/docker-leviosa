import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { MillisIn } from '@leviosa/shared';
import { Config } from '../config/index.config.js';
import { VolumeRepository } from '../docker/index.docker.js';
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
async function _runSnapshot(): Promise<void> {
  if (snapshotRunning) {
    log.warn('previous snapshot round is still running; skipping this tick');
    return;
  }

  snapshotRunning = true;
  const startedAt = Clock.nowMs();

  try {
    const volumes = await VolumeRepository.listAll();
    const outcomes = await Promise.allSettled(
      volumes.map(async (volume) => ScanQueue.run(volume.name)),
    );

    const measured = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const totalBytes = measured.reduce(
      (sum, outcome) => sum + (outcome.status === 'fulfilled' ? outcome.value.totalBytes : 0),
      0,
    );

    MeasurementRepository.pruneOlderThan(Clock.daysAgoMs(Config.database.retentionDays));

    log.info(
      {
        volumes: volumes.length,
        measured: measured.length,
        failed: outcomes.length - measured.length,
        totalBytes: Bytes.format(totalBytes),
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
  try {
    await SightingService.refresh();
  } catch (error) {
    // The daemon being briefly unreachable is not worth escalating; the next tick retries.
    log.debug({ err: error }, 'sighting refresh skipped');
  }
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
