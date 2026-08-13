import {
  BrowseDefaults,
  GrowthDefaults,
  MillisIn,
  SortDirection,
  VolumeSortKey,
} from '@leviosa/shared';
import type {
  GrowthPoint,
  GrowthSeries,
  Paginated,
  VolumeConsumer,
  VolumeDeleteResult,
  VolumeDetail,
  VolumeSummary,
} from '@leviosa/shared';
import { AuditAction, Config } from '../config/index.config.js';
import { ContainerRepository, VolumeRepository } from '../docker/index.docker.js';
import {
  AuditRepository,
  MeasurementRepository,
  SightingRepository,
} from '../store/index.store.js';
import type { StoredMeasurement, StoredSighting } from '../store/index.store.js';
import type { VolumeRecord } from '../types/internal.types.js';
import { ApiErrors, Clock, Logger, Pagination } from '../utils/index.utils.js';
import type { NormalizedVolumeListQuery } from '../validations/index.validations.js';
import { DependencyService } from './dependency.service.js';
import { MeasurementMapper } from './measurement.mapper.js';
import { SafetyService } from './safety.service.js';
import { SightingService } from './sighting.service.js';

const log = Logger.for('volume-service');

interface AssemblyContext {
  consumersByVolume: Map<string, VolumeConsumer[]>;
  measurements: Map<string, StoredMeasurement>;
  sightings: Map<string, StoredSighting>;
}

/** Nulls sort last regardless of direction: "unknown" is not "smallest". */
function _compareNullable(left: number | null, right: number | null, direction: SortDirection): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return direction === SortDirection.ASC ? left - right : right - left;
}

function _sortKeyOf(summary: VolumeSummary, key: VolumeSortKey): number | null {
  switch (key) {
    case VolumeSortKey.SIZE:
      return summary.size?.totalBytes ?? null;
    case VolumeSortKey.CREATED_AT:
      return Clock.parseIso(summary.createdAt);
    case VolumeSortKey.LAST_WRITE_AT:
      return Clock.parseIso(summary.size?.lastWriteAt ?? null);
    case VolumeSortKey.NAME:
      return null;
    default:
      return null;
  }
}

function _sort(rows: VolumeSummary[], query: NormalizedVolumeListQuery): VolumeSummary[] {
  const direction = query.order;

  return [...rows].sort((left, right) => {
    if (query.sort === VolumeSortKey.NAME) {
      const byName = left.name.localeCompare(right.name);
      return direction === SortDirection.ASC ? byName : -byName;
    }
    const compared = _compareNullable(
      _sortKeyOf(left, query.sort),
      _sortKeyOf(right, query.sort),
      direction,
    );
    // Stable tie-break so pagination cannot shuffle equal rows between pages.
    return compared !== 0 ? compared : left.name.localeCompare(right.name);
  });
}

function _matches(summary: VolumeSummary, query: NormalizedVolumeListQuery): boolean {
  if (query.usage && summary.usage.status !== query.usage) {
    return false;
  }
  if (query.project && summary.composeProject !== query.project) {
    return false;
  }
  if (query.search && !summary.name.toLowerCase().includes(query.search.toLowerCase())) {
    return false;
  }
  return true;
}

async function _loadContext(): Promise<AssemblyContext> {
  return {
    consumersByVolume: await DependencyService.buildGraph(),
    measurements: MeasurementRepository.latestForAll(),
    sightings: SightingRepository.findAll(),
  };
}

/** Composes one row from the daemon record plus everything we know locally. */
function _toSummary(volume: VolumeRecord, context: AssemblyContext): VolumeSummary {
  const usage = DependencyService.summarize(context.consumersByVolume.get(volume.name) ?? []);
  const measurement = context.measurements.get(volume.name) ?? null;
  const reclaimable = measurement?.totalBytes ?? null;

  return {
    name: volume.name,
    driver: volume.driver,
    scope: volume.scope,
    createdAt: Clock.toIso(volume.createdAtMs),
    mountpoint: volume.mountpoint,
    labels: volume.labels,
    composeProject: volume.composeProject,
    usage,
    size: measurement ? MeasurementMapper.toWire(measurement) : null,
    freshness: MeasurementMapper.freshnessOf(measurement),
    safety: SafetyService.evaluate(volume, usage, reclaimable),
    sighting: SightingService.present(context.sightings.get(volume.name) ?? null),
  };
}

/**
 * Resolution for a charted window. Buckets are sized to fill the point budget rather
 * than fixed at one per day: a one-day window then shows hourly detail, which is what
 * someone wants immediately after deleting files and re-scanning, while a year-long
 * window still returns a bounded payload.
 */
function _bucketMsFor(days: number): number {
  const windowMs = days * MillisIn.DAY;
  return Math.max(MillisIn.HOUR, Math.ceil(windowMs / GrowthDefaults.MAX_POINTS));
}

function _buildGrowth(volumeName: string, days: number): GrowthSeries {
  const stored = MeasurementRepository.series(volumeName, Clock.daysAgoMs(days), _bucketMsFor(days));

  let previous: number | null = null;
  const points: GrowthPoint[] = stored.map((point) => {
    const deltaBytes = previous === null ? null : point.totalBytes - previous;
    previous = point.totalBytes;
    return {
      capturedAt: new Date(point.capturedAtMs).toISOString(),
      totalBytes: point.totalBytes,
      deltaBytes,
    };
  });

  const first = points.at(0);
  const last = points.at(-1);
  const windowDeltaBytes =
    first && last && points.length > 1 ? last.totalBytes - first.totalBytes : null;

  return { points, windowDeltaBytes, windowDays: days };
}

/**
 * Assembles the answer to "what is going on with my volumes?" from three independent
 * sources: the daemon's volume list, the container dependency graph, and our own
 * measurement and sighting history.
 *
 * Filtering, sorting and pagination happen in memory on purpose. The Engine API cannot
 * sort volumes by size (it has no idea how big they are) and a developer machine has
 * tens to low hundreds of volumes, so one inventory pass beats any scheme that pushes
 * predicates down into a store that lacks the data.
 */
export const VolumeService = Object.freeze({
  async list(query: NormalizedVolumeListQuery): Promise<Paginated<VolumeSummary>> {
    const [volumes, context] = await Promise.all([VolumeRepository.listAll(), _loadContext()]);

    const rows = volumes
      .map((volume) => _toSummary(volume, context))
      .filter((summary) => _matches(summary, query));

    return Pagination.slice(_sort(rows, query), query.limit, query.offset);
  },

  async detail(name: string, growthDays: number): Promise<VolumeDetail> {
    const [volume, context] = await Promise.all([VolumeRepository.findOrFail(name), _loadContext()]);
    const summary = _toSummary(volume, context);
    const measurement = context.measurements.get(name) ?? null;

    return {
      ...summary,
      topEntries: measurement
        ? MeasurementMapper.toEntries(measurement.topEntries, BrowseDefaults.ROOT_PATH)
        : [],
      growth: _buildGrowth(name, growthDays),
    };
  },

  /**
   * Removes a volume behind three independent gates: the feature flag, a confirmation
   * token that must equal the volume name, and a fresh safety evaluation. The safety
   * check is repeated here even though the client already saw it, because the container
   * inventory can change between rendering a page and clicking a button.
   */
  async remove(name: string, confirm: string): Promise<VolumeDeleteResult> {
    if (!Config.features.allowVolumeDelete) {
      throw ApiErrors.featureDisabled('Volume deletion');
    }
    if (confirm !== name) {
      throw ApiErrors.confirmationRequired(name);
    }

    const volume = await VolumeRepository.findOrFail(name);
    const usage = DependencyService.summarize(await DependencyService.consumersOf(name));
    const measurement = MeasurementRepository.latest(name);
    const safety = SafetyService.evaluate(volume, usage, measurement?.totalBytes ?? null);

    if (!safety.deletable) {
      AuditRepository.record(AuditAction.VOLUME_DELETE_BLOCKED, name, {
        verdict: safety.verdict,
        blockers: safety.blockers.map((blocker) => blocker.containerName),
      });
      throw ApiErrors.volumeInUse(name, {
        verdict: safety.verdict,
        reason: safety.reason,
        blockers: safety.blockers,
      });
    }

    await VolumeRepository.remove(name);
    // The volume is gone; its history would otherwise resurrect as a phantom row if a
    // future volume reused the name.
    MeasurementRepository.forget(name);
    SightingRepository.forget(name);
    ContainerRepository.invalidate();

    const reclaimedBytes = measurement?.totalBytes ?? null;
    AuditRepository.record(AuditAction.VOLUME_DELETED, name, { reclaimedBytes });
    log.info({ volume: name, reclaimedBytes }, 'volume removed');

    return { name, deleted: true, reclaimedBytes };
  },

  /** Existence is verified against the daemon so an unknown name 404s instead of returning an empty series. */
  async growth(name: string, days: number): Promise<GrowthSeries> {
    await VolumeRepository.findOrFail(name);
    return _buildGrowth(name, days);
  },
});
