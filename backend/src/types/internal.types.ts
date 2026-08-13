import type { ScanSource } from '@leviosa/shared';

/** A container's dependency on a single named volume. */
export interface ContainerVolumeMount {
  volumeName: string;
  /** Path inside the container. */
  mountPath: string;
  readOnly: boolean;
}

/** Normalised projection of the Engine's container list entry. */
export interface ContainerRecord {
  id: string;
  shortId: string;
  name: string;
  state: string;
  /** True while the container is holding its mounts open. */
  live: boolean;
  image: string;
  composeProject: string | null;
  composeService: string | null;
  volumeMounts: ContainerVolumeMount[];
}

/** Normalised projection of the Engine's volume list entry. */
export interface VolumeRecord {
  name: string;
  driver: string;
  scope: string;
  mountpoint: string;
  createdAtMs: number | null;
  labels: Record<string, string>;
  composeProject: string | null;
}

/** Raw output of a measurement, before it is persisted or enveloped. */
export interface RawMeasurement {
  totalBytes: number;
  fileCount: number;
  directoryCount: number;
  lastWriteAtMs: number | null;
  source: ScanSource;
  durationMs: number;
  truncated: boolean;
}

/** Depth-one directory listing, shared by the measure and browse paths. */
export interface RawEntry {
  name: string;
  kind: string;
  sizeBytes: number;
  modifiedAtMs: number | null;
}

export interface RawListing {
  entries: RawEntry[];
  truncated: boolean;
}

/** Which measurement strategy this host supports, and why. */
export interface StrategyDecision {
  source: ScanSource;
  reason: string;
}
