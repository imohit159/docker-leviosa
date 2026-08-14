import type { HostKind, HostStatus, ScanSource } from './enums.shared.js';
import type { QueueStats } from './job.types.js';

/** Aggregate headline numbers for the dashboard. */
export interface SystemSummary {
  /** Host these figures describe. Totals are never summed across hosts. */
  hostId: string;
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

/** One host's diagnostics, as reported by the health endpoint. */
export interface HostDaemonReport extends DaemonInfo {
  hostId: string;
  label: string;
  kind: HostKind;
  status: HostStatus;
}

export interface HealthReport {
  /**
   * Health of the service, not of any single daemon.
   *
   * Degraded means no enabled host answered at all, so the tool can show nothing. A
   * single unreachable VPS leaves this `ok` on purpose: it is reported through that
   * host's own entry, and letting it flip the top level would turn one dead remote
   * into a 503 on every request, including for hosts that are perfectly healthy.
   */
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  hosts: HostDaemonReport[];
}
