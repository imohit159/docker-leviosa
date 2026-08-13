import type {
  DeleteVerdict,
  EntryKind,
  MeasurementFreshness,
  ScanSource,
  VolumeUsage,
} from './enums.shared.js';

/** A single container -> volume mount edge in the dependency graph. */
export interface VolumeConsumer {
  containerId: string;
  containerShortId: string;
  containerName: string;
  /** Raw Docker state string, e.g. `running`, `exited`. */
  state: string;
  /** Whether the container is currently holding the mount open. */
  live: boolean;
  /** Path the volume is mounted at *inside* the container. */
  mountPath: string;
  readOnly: boolean;
  image: string;
  composeProject: string | null;
  composeService: string | null;
}

/** One measured point in time for a volume's on-disk footprint. */
export interface SizeMeasurement {
  totalBytes: number;
  fileCount: number;
  directoryCount: number;
  /** Epoch millis of the newest mtime found inside the volume, if computed. */
  lastWriteAt: string | null;
  source: ScanSource;
  measuredAt: string;
  durationMs: number;
  /** True when the walk hit its time budget and the figures are a lower bound. */
  truncated: boolean;
}

/** Immediate child of a directory, with recursive size for directories. */
export interface VolumeEntry {
  name: string;
  /** Volume-relative POSIX path, always prefixed with `/`. */
  path: string;
  kind: EntryKind;
  sizeBytes: number;
  modifiedAt: string | null;
}

/** Outcome of the pre-flight guard that runs before any destructive action. */
export interface DeleteSafety {
  deletable: boolean;
  verdict: DeleteVerdict;
  reason: string;
  /** Containers that must be removed first, if any. */
  blockers: VolumeConsumer[];
  /** Bytes the caller would reclaim, when a measurement exists. */
  reclaimableBytes: number | null;
}

/**
 * What we have personally observed about a volume over time. Docker keeps no such
 * ledger, so anything here is only as old as this tool's install.
 */
export interface VolumeSighting {
  firstSeenAt: string;
  lastSeenAt: string;
  /** Last time we caught it attached to any container. Null means never observed attached. */
  lastSeenAttachedAt: string | null;
  /** Days since the last attachment we witnessed. Null when never observed attached. */
  idleDays: number | null;
  /** False until the tool has been running long enough for idle data to mean anything. */
  trackingReliable: boolean;
}

export interface VolumeUsageReport {
  status: VolumeUsage;
  liveCount: number;
  stoppedCount: number;
  consumers: VolumeConsumer[];
}

/** Row shape for the volume collection. */
export interface VolumeSummary {
  name: string;
  driver: string;
  scope: string;
  createdAt: string | null;
  /** Path on the daemon host. Often unreadable from this process; informational only. */
  mountpoint: string;
  labels: Record<string, string>;
  composeProject: string | null;
  usage: VolumeUsageReport;
  /** Last cached measurement, or null when never scanned. */
  size: SizeMeasurement | null;
  freshness: MeasurementFreshness;
  safety: DeleteSafety;
  sighting: VolumeSighting | null;
}

/** One row of the growth series. */
export interface GrowthPoint {
  capturedAt: string;
  totalBytes: number;
  /** Change against the previous point; null for the first point in the series. */
  deltaBytes: number | null;
}

export interface GrowthSeries {
  points: GrowthPoint[];
  /** Net change across the whole window, null when fewer than two points exist. */
  windowDeltaBytes: number | null;
  windowDays: number;
}

/** Full detail payload for a single volume. */
export interface VolumeDetail extends VolumeSummary {
  /** Largest immediate children, descending by size. */
  topEntries: VolumeEntry[];
  growth: GrowthSeries;
}

export interface VolumeBrowseResult {
  volumeName: string;
  path: string;
  parentPath: string | null;
  entries: VolumeEntry[];
  /** True when the listing was capped by the configured entry limit. */
  truncated: boolean;
}

export interface VolumeDeleteResult {
  name: string;
  deleted: boolean;
  reclaimedBytes: number | null;
}
