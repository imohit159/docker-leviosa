import type { ScanSource } from '@leviosa/shared';
import type { HostContext } from '../docker/index.docker.js';
import type { RawEntry, RawListing, RawMeasurement } from '../types/internal.types.js';

export interface MeasureOutcome {
  measurement: RawMeasurement;
  /** Depth-one breakdown of the volume root, largest first. */
  entries: RawEntry[];
}

export interface StrategyTarget {
  /** The daemon the volume lives on. Decides which strategies are even eligible. */
  host: HostContext;
  volumeName: string;
  /** Daemon-side mountpoint. Only meaningful to the host filesystem strategy. */
  mountpoint: string;
}

/**
 * Contract every measurement backend implements. Two exist today — a throwaway
 * container and a direct filesystem walk — and the service picks per volume at call
 * time. Adding a third (a daemon-side agent, say) means implementing this and
 * nothing else.
 */
export interface ScanStrategy {
  readonly source: ScanSource;

  /** Cheap check: can this strategy measure this specific volume right now? */
  isUsable(target: StrategyTarget): Promise<boolean>;

  /** Recursive totals plus the root-level breakdown. */
  measure(target: StrategyTarget): Promise<MeasureOutcome>;

  /** Depth-one listing of one volume-relative directory. */
  list(target: StrategyTarget, path: string): Promise<RawListing>;
}
