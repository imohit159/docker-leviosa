import process from 'node:process';
import { HostStatus, ScanSource, VolumeUsage } from '@leviosa/shared';
import type { DaemonInfo, HealthReport, HostDaemonReport, SystemSummary } from '@leviosa/shared';
import { HostRegistry, VolumeRepository } from '../docker/index.docker.js';
import type { HostContext } from '../docker/index.docker.js';
import { ScanQueue } from '../queue/index.queue.js';
import { ScannerService } from '../scanner/index.scanner.js';
import { HostRepository, MeasurementRepository } from '../store/index.store.js';
import { Logger } from '../utils/index.utils.js';
import { DependencyService } from './dependency.service.js';

const log = Logger.for('system-service');

/**
 * Dashboard headline numbers and daemon diagnostics.
 *
 * The totals distinguish measured from unmeasured volumes rather than treating an
 * unmeasured volume as zero bytes. Reporting "0 B" for something never scanned would
 * quietly understate reclaimable space, which is the one number a user is likely to act
 * on.
 */
export const SystemService = Object.freeze({
  async summary(host: HostContext): Promise<SystemSummary> {
    const [volumes, graph] = await Promise.all([
      VolumeRepository.listAll(host),
      DependencyService.buildGraph(host),
    ]);
    const measurements = MeasurementRepository.latestForAll(host.hostId);

    let inUseCount = 0;
    let reservedCount = 0;
    let orphanedCount = 0;
    let measuredBytes = 0;
    let reclaimableBytes = 0;
    let unmeasuredCount = 0;

    for (const volume of volumes) {
      const usage = DependencyService.summarize(graph.get(volume.name) ?? []);
      const measurement = measurements.get(volume.name);

      if (measurement) {
        measuredBytes += measurement.totalBytes;
      } else {
        unmeasuredCount += 1;
      }

      switch (usage.status) {
        case VolumeUsage.IN_USE:
          inUseCount += 1;
          break;
        case VolumeUsage.RESERVED:
          reservedCount += 1;
          break;
        case VolumeUsage.ORPHANED:
          orphanedCount += 1;
          reclaimableBytes += measurement?.totalBytes ?? 0;
          break;
        default:
          break;
      }
    }

    return {
      hostId: host.hostId,
      volumeCount: volumes.length,
      inUseCount,
      reservedCount,
      orphanedCount,
      measuredBytes,
      reclaimableBytes,
      unmeasuredCount,
      queue: ScanQueue.stats(host.hostId),
    };
  },

  async daemon(host: HostContext): Promise<DaemonInfo> {
    const reachable = await host.ping();
    const strategy = await ScannerService.describeStrategy(host);

    if (!reachable) {
      return {
        reachable: false,
        version: null,
        apiVersion: null,
        operatingSystem: null,
        dockerRootDir: null,
        scanSource: strategy.source,
        scanSourceReason: strategy.reason,
      };
    }

    HostRepository.markSeen(host.hostId);
    const [version, info] = await Promise.all([host.version(), host.info()]);

    return {
      reachable: true,
      version: version?.version ?? null,
      apiVersion: version?.apiVersion ?? null,
      operatingSystem: info?.OperatingSystem ?? null,
      dockerRootDir: info?.DockerRootDir ?? null,
      scanSource: strategy.source,
      scanSourceReason: strategy.reason,
    };
  },

  /**
   * Probes every registered host in parallel.
   *
   * Errors are absorbed into an unreachable report rather than propagated: health is
   * the endpoint an operator hits precisely when something is broken, so it has to
   * answer even when a host is down.
   */
  async health(): Promise<HealthReport> {
    const records = HostRepository.findAll();

    const hosts = await Promise.all(
      records.map(async (record): Promise<HostDaemonReport> => {
        const base = { hostId: record.id, label: record.label, kind: record.kind };

        if (!record.enabled) {
          return { ...base, status: HostStatus.DISABLED, ..._unreachableDaemon() };
        }

        try {
          const daemon = await SystemService.daemon(HostRegistry.get(record.id));
          return {
            ...base,
            status: daemon.reachable ? HostStatus.ONLINE : HostStatus.OFFLINE,
            ...daemon,
          };
        } catch (error) {
          log.warn({ err: error, hostId: record.id }, 'health probe failed');
          return { ...base, status: HostStatus.OFFLINE, ..._unreachableDaemon() };
        }
      }),
    );

    const anyReachable = hosts.some((host) => host.reachable);

    return {
      status: anyReachable ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      hosts,
    };
  },
});

function _unreachableDaemon(): DaemonInfo {
  return {
    reachable: false,
    version: null,
    apiVersion: null,
    operatingSystem: null,
    dockerRootDir: null,
    scanSource: ScanSource.SIDECAR,
    scanSourceReason: 'The daemon did not answer, so no scan strategy could be resolved.',
  };
}
