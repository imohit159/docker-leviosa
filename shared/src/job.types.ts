import type { JobState } from './enums.shared.js';
import type { SizeMeasurement } from './volume.types.js';

/** A queued size measurement. Scans are IO-bound and can run for minutes. */
export interface ScanJob {
  id: string;
  /** Which daemon the volume lives on. Names are unique per host, not globally. */
  hostId: string;
  volumeName: string;
  state: JobState;
  /** Position in the queue while QUEUED; null once it starts. */
  queuePosition: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  result: SizeMeasurement | null;
  error: string | null;
}

export interface QueueStats {
  queued: number;
  running: number;
  concurrency: number;
  /** Rolling counters since process start. */
  completed: number;
  failed: number;
}
