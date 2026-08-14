import { ApiRoute } from '@leviosa/shared';
import type {
  CreateHostInput,
  DockerHost,
  GrowthSeries,
  HealthReport,
  HostConnectionTest,
  Paginated,
  ScanJob,
  SystemSummary,
  UpdateHostInput,
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
 *
 * `hostId` is a required leading argument on everything volume-shaped rather than an
 * option with a default. A defaultable host is a host you can forget to pass, and the
 * failure mode is silently reading the wrong machine.
 */
export const VolumeApi = Object.freeze({
  list(hostId: string, query: VolumeListQuery): Promise<Paginated<VolumeSummary>> {
    return ApiClient.get<Paginated<VolumeSummary>>(ApiRoute.volumes(hostId), { ...query });
  },

  detail(hostId: string, name: string, days?: number): Promise<VolumeDetail> {
    return ApiClient.get<VolumeDetail>(ApiRoute.volume(hostId, name), { days });
  },

  entries(hostId: string, name: string, path: string): Promise<VolumeBrowseResult> {
    return ApiClient.get<VolumeBrowseResult>(ApiRoute.volumeEntries(hostId, name), { path });
  },

  growth(hostId: string, name: string, days: number): Promise<GrowthSeries> {
    return ApiClient.get<GrowthSeries>(ApiRoute.volumeGrowth(hostId, name), { days });
  },

  /** Queues a measurement and returns the job handle to poll. */
  scan(hostId: string, name: string): Promise<ScanJob> {
    return ApiClient.post<ScanJob>(ApiRoute.volumeScans(hostId, name));
  },

  /** `confirm` must equal the volume name; the API rejects anything else. */
  remove(hostId: string, name: string, confirm: string): Promise<VolumeDeleteResult> {
    return ApiClient.delete<VolumeDeleteResult>(ApiRoute.volume(hostId, name), { confirm });
  },
});

export const JobApi = Object.freeze({
  detail(id: string): Promise<ScanJob> {
    return ApiClient.get<ScanJob>(ApiRoute.job(id));
  },
});

export const SystemApi = Object.freeze({
  summary(hostId: string): Promise<SystemSummary> {
    return ApiClient.get<SystemSummary>(ApiRoute.systemSummary(hostId));
  },

  /** Spans every registered host, so it takes no host argument. */
  health(): Promise<HealthReport> {
    return ApiClient.get<HealthReport>(ApiRoute.health());
  },
});

export const HostApi = Object.freeze({
  list(): Promise<DockerHost[]> {
    return ApiClient.get<DockerHost[]>(ApiRoute.hosts());
  },

  create(input: CreateHostInput): Promise<DockerHost> {
    return ApiClient.post<DockerHost>(ApiRoute.hosts(), undefined, input);
  },

  update(hostId: string, patch: UpdateHostInput): Promise<DockerHost> {
    return ApiClient.patch<DockerHost>(ApiRoute.host(hostId), patch);
  },

  remove(hostId: string): Promise<{ id: string; deleted: boolean }> {
    return ApiClient.delete<{ id: string; deleted: boolean }>(ApiRoute.host(hostId));
  },

  /** Probes the connection. Resolves with a failure outcome rather than throwing. */
  test(hostId: string): Promise<HostConnectionTest> {
    return ApiClient.post<HostConnectionTest>(ApiRoute.hostTest(hostId));
  },

  /** Pins a host key the operator has read and accepted. */
  trust(hostId: string, fingerprint: string): Promise<DockerHost> {
    return ApiClient.post<DockerHost>(ApiRoute.hostTrust(hostId), undefined, { fingerprint });
  },
});
