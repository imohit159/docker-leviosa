import type { ScanSource } from './enums.shared.js';
import type { QueueStats } from './job.types.js';

/** Aggregate headline numbers for the dashboard. */
export interface SystemSummary {
  volumeCount: number;
  inUseCount: number;
  reservedCount: number;
  orphanedCount: number;
  /** Sum of cached measurements only; unmeasured volumes are excluded. */
  measuredBytes: number;
  /** Cached bytes held by orphaned volumes: the honest "reclaimable" figure. */
  reclaimableBytes: number;
  /** Volumes with no cached measurement yet, so the totals above are partial. */
  unmeasuredCount: number;
  queue: QueueStats;
}

export interface DaemonInfo {
  reachable: boolean;
  /** Engine version string, null when unreachable. */
  version: string | null;
  apiVersion: string | null;
  operatingSystem: string | null;
  /** Daemon-side storage root. Rarely readable from this process. */
  dockerRootDir: string | null;
  /** Strategy the scanner resolved for this host. */
  scanSource: ScanSource;
  /** Why the host filesystem fast path was rejected, when it was. */
  scanSourceReason: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  daemon: DaemonInfo;
}
