import { ApiRoute } from '@leviosa/shared';
import type {
  GrowthSeries,
  HealthReport,
  Paginated,
  ScanJob,
  SystemSummary,
  VolumeBrowseResult,
  VolumeDeleteResult,
  VolumeDetail,
  VolumeListQuery,
  VolumeSummary,
} from '@leviosa/shared';
import { ApiClient } from './api.client';

/**
 * One function per endpoint, typed by the shared contract and using the shared route
 * builders. No component ever constructs a URL, so a path change on the server is a
 * compile-time concern here rather than a runtime 404.
 */
export const VolumeApi = Object.freeze({
  list(query: VolumeListQuery): Promise<Paginated<VolumeSummary>> {
    return ApiClient.get<Paginated<VolumeSummary>>(ApiRoute.volumes(), { ...query });
  },

  detail(name: string, days?: number): Promise<VolumeDetail> {
    return ApiClient.get<VolumeDetail>(ApiRoute.volume(name), { days });
  },

  entries(name: string, path: string): Promise<VolumeBrowseResult> {
    return ApiClient.get<VolumeBrowseResult>(ApiRoute.volumeEntries(name), { path });
  },

  growth(name: string, days: number): Promise<GrowthSeries> {
    return ApiClient.get<GrowthSeries>(ApiRoute.volumeGrowth(name), { days });
  },

  /** Queues a measurement and returns the job handle to poll. */
  scan(name: string): Promise<ScanJob> {
    return ApiClient.post<ScanJob>(ApiRoute.volumeScans(name));
  },

  /** `confirm` must equal the volume name; the API rejects anything else. */
  remove(name: string, confirm: string): Promise<VolumeDeleteResult> {
    return ApiClient.delete<VolumeDeleteResult>(ApiRoute.volume(name), { confirm });
  },
});

export const JobApi = Object.freeze({
  detail(id: string): Promise<ScanJob> {
    return ApiClient.get<ScanJob>(ApiRoute.job(id));
  },
});

export const SystemApi = Object.freeze({
  summary(): Promise<SystemSummary> {
    return ApiClient.get<SystemSummary>(ApiRoute.systemSummary());
  },

  health(): Promise<HealthReport> {
    return ApiClient.get<HealthReport>(ApiRoute.health());
  },
});
