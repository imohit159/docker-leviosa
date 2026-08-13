import { JobState } from '@leviosa/shared';
import type { QueueStats, ScanJob } from '@leviosa/shared';
import { AuditAction, Config } from '../config/index.config.js';
import { VolumeRepository } from '../docker/index.docker.js';
import { ScannerService } from '../scanner/index.scanner.js';
import { MeasurementMapper } from '../services/measurement.mapper.js';
import { AuditRepository, MeasurementRepository } from '../store/index.store.js';
import type { StoredMeasurement } from '../store/index.store.js';
import { ApiErrors, Clock, Identifier, Logger } from '../utils/index.utils.js';
import { TaskQueue } from './task.queue.js';

const log = Logger.for('queue:scan');

/** Finished jobs are retained for polling, then evicted oldest-first. */
const RETAINED_JOB_LIMIT = 200;

interface JobEntry {
  job: ScanJob;
  /** Resolves when the measurement settles; lets callers wait for a synchronous answer. */
  settled: Promise<StoredMeasurement>;
}

const queue = TaskQueue.create({
  concurrency: Config.scan.concurrency,
  limit: Config.scan.queueLimit,
});

const jobs = new Map<string, JobEntry>();
/** Volume name -> job id, for the currently queued or running scan of that volume. */
const activeByVolume = new Map<string, string>();

function _isSettled(state: ScanJob['state']): boolean {
  return state === JobState.SUCCEEDED || state === JobState.FAILED || state === JobState.CANCELLED;
}

function _evictOldFinishedJobs(): void {
  if (jobs.size <= RETAINED_JOB_LIMIT) {
    return;
  }
  for (const [id, entry] of jobs) {
    if (jobs.size <= RETAINED_JOB_LIMIT) {
      break;
    }
    if (_isSettled(entry.job.state)) {
      jobs.delete(id);
    }
  }
}

/** Measures one volume and appends the result to the history table. */
async function _execute(volumeName: string): Promise<StoredMeasurement> {
  const volume = await VolumeRepository.findOrFail(volumeName);
  const outcome = await ScannerService.measure({
    volumeName: volume.name,
    mountpoint: volume.mountpoint,
  });

  const stored = MeasurementRepository.record(volume.name, outcome.measurement, outcome.entries);
  AuditRepository.record(AuditAction.SCAN_COMPLETED, volume.name, {
    totalBytes: stored.totalBytes,
    source: stored.source,
    durationMs: stored.durationMs,
  });

  return stored;
}

/**
 * Job registry in front of the bounded queue.
 *
 * Jobs live in memory only. That is a deliberate scope decision: a scan is a
 * best-effort refresh of a cache whose durable output is the measurement row, so
 * persisting the job itself would buy nothing after a restart beyond a stale progress
 * bar. Callers are told this explicitly in the JOB_NOT_FOUND message.
 */
export const ScanQueue = Object.freeze({
  /**
   * Submits a scan. Requesting a volume that is already queued or running returns the
   * existing job rather than piling on duplicate work.
   */
  enqueue(volumeName: string): ScanJob {
    const activeId = activeByVolume.get(volumeName);
    const active = activeId === undefined ? undefined : jobs.get(activeId);
    if (active && !_isSettled(active.job.state)) {
      return ScanQueue.describe(active.job);
    }

    // Refuse here rather than returning a job handle that is already doomed: the caller
    // deserves a 429 it can act on, not an accepted job that fails a microtask later.
    if (queue.isSaturated()) {
      throw ApiErrors.queueSaturated(Config.scan.queueLimit);
    }

    const job: ScanJob = {
      id: Identifier.uuid(),
      volumeName,
      state: JobState.QUEUED,
      queuePosition: queue.backlog(),
      createdAt: Clock.nowIso(),
      startedAt: null,
      finishedAt: null,
      result: null,
      error: null,
    };

    const settled = queue
      .submit(async () => {
        job.state = JobState.RUNNING;
        job.startedAt = Clock.nowIso();
        job.queuePosition = null;
        return _execute(volumeName);
      })
      .then((stored) => {
        job.state = JobState.SUCCEEDED;
        job.finishedAt = Clock.nowIso();
        job.result = MeasurementMapper.toWire(stored);
        return stored;
      })
      .catch((error: unknown) => {
        job.state = JobState.FAILED;
        job.finishedAt = Clock.nowIso();
        job.error = error instanceof Error ? error.message : 'unknown scan failure';
        AuditRepository.record(AuditAction.SCAN_FAILED, volumeName, { reason: job.error });
        log.warn({ err: error, volume: volumeName }, 'scan job failed');
        throw error;
      })
      .finally(() => {
        if (activeByVolume.get(volumeName) === job.id) {
          activeByVolume.delete(volumeName);
        }
        _evictOldFinishedJobs();
      });

    // The rejection is delivered to whoever awaits `settled`; an unobserved rejection
    // here would otherwise take down the process.
    settled.catch(() => undefined);

    jobs.set(job.id, { job, settled });
    activeByVolume.set(volumeName, job.id);

    return ScanQueue.describe(job);
  },

  /** Enqueues and waits. Used by the scheduler and by callers that want a fresh number. */
  async run(volumeName: string): Promise<StoredMeasurement> {
    const job = ScanQueue.enqueue(volumeName);
    const entry = jobs.get(job.id);
    if (!entry) {
      throw new Error(`Scan job ${job.id} vanished before it could be awaited.`);
    }
    return entry.settled;
  },

  find(id: string): ScanJob | null {
    const entry = jobs.get(id);
    return entry ? ScanQueue.describe(entry.job) : null;
  },

  /** Snapshot copy: callers must never hold a reference to mutable job state. */
  describe(job: ScanJob): ScanJob {
    return { ...job };
  },

  stats(): QueueStats {
    return queue.stats();
  },
});
