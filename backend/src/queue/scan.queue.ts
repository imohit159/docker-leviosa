import { JobState } from '@leviosa/shared';
import type { QueueStats, ScanJob } from '@leviosa/shared';
import { AuditAction, Config, HOST_VOLUME_SEPARATOR } from '../config/index.config.js';
import { VolumeRepository } from '../docker/index.docker.js';
import type { HostContext } from '../docker/index.docker.js';
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

/**
 * One queue per host, each with its own concurrency budget.
 *
 * A single shared queue would let one slow or unreachable host occupy every worker slot
 * — scans against a dead VPS sit there until the timeout expires — and starve the local
 * daemon's scans behind them. Isolating the budgets means a remote host can only ever
 * degrade itself.
 */
const queuesByHost = new Map<string, ReturnType<typeof TaskQueue.create>>();

function _queueFor(hostId: string): ReturnType<typeof TaskQueue.create> {
  const existing = queuesByHost.get(hostId);
  if (existing) {
    return existing;
  }
  const created = TaskQueue.create({
    concurrency: Config.scan.concurrency,
    limit: Config.scan.queueLimit,
  });
  queuesByHost.set(hostId, created);
  return created;
}

const jobs = new Map<string, JobEntry>();
/**
 * `hostId/volumeName` -> job id, for the currently queued or running scan.
 *
 * Keyed by host as well as name because volume names are only unique per daemon: a
 * `postgres-data` on two hosts is two different volumes, and a name-only key would
 * silently hand the second one the first one's job and its numbers.
 */
const activeByVolume = new Map<string, string>();

function _activeKey(hostId: string, volumeName: string): string {
  return `${hostId}${HOST_VOLUME_SEPARATOR}${volumeName}`;
}

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
async function _execute(host: HostContext, volumeName: string): Promise<StoredMeasurement> {
  const volume = await VolumeRepository.findOrFail(host, volumeName);
  const outcome = await ScannerService.measure({
    host,
    volumeName: volume.name,
    mountpoint: volume.mountpoint,
  });

  const stored = MeasurementRepository.record(host.hostId, volume.name, outcome.measurement, outcome.entries);
  AuditRepository.record(host.hostId, AuditAction.SCAN_COMPLETED, volume.name, {
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
  enqueue(host: HostContext, volumeName: string): ScanJob {
    const activeKey = _activeKey(host.hostId, volumeName);
    const activeId = activeByVolume.get(activeKey);
    const active = activeId === undefined ? undefined : jobs.get(activeId);
    if (active && !_isSettled(active.job.state)) {
      return ScanQueue.describe(active.job);
    }

    const queue = _queueFor(host.hostId);

    // Refuse here rather than returning a job handle that is already doomed: the caller
    // deserves a 429 it can act on, not an accepted job that fails a microtask later.
    if (queue.isSaturated()) {
      throw ApiErrors.queueSaturated(Config.scan.queueLimit);
    }

    const job: ScanJob = {
      id: Identifier.uuid(),
      hostId: host.hostId,
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
        return _execute(host, volumeName);
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
        AuditRepository.record(host.hostId, AuditAction.SCAN_FAILED, volumeName, { reason: job.error });
        log.warn({ err: error, hostId: host.hostId, volume: volumeName }, 'scan job failed');
        throw error;
      })
      .finally(() => {
        if (activeByVolume.get(activeKey) === job.id) {
          activeByVolume.delete(activeKey);
        }
        _evictOldFinishedJobs();
      });

    // The rejection is delivered to whoever awaits `settled`; an unobserved rejection
    // here would otherwise take down the process.
    settled.catch(() => undefined);

    jobs.set(job.id, { job, settled });
    activeByVolume.set(activeKey, job.id);

    return ScanQueue.describe(job);
  },

  /** Enqueues and waits. Used by the scheduler and by callers that want a fresh number. */
  async run(host: HostContext, volumeName: string): Promise<StoredMeasurement> {
    const job = ScanQueue.enqueue(host, volumeName);
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

  /** Queue depth for one host. The dashboard reports the host it is looking at. */
  stats(hostId: string): QueueStats {
    return _queueFor(hostId).stats();
  },
});
