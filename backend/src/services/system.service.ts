import process from 'node:process';
import { VolumeUsage } from '@leviosa/shared';
import type { DaemonInfo, HealthReport, SystemSummary } from '@leviosa/shared';
import { DockerClient, VolumeRepository } from '../docker/index.docker.js';
import { ScanQueue } from '../queue/index.queue.js';
import { ScannerService } from '../scanner/index.scanner.js';
import { MeasurementRepository } from '../store/index.store.js';
import { DependencyService } from './dependency.service.js';

/**
 * Dashboard headline numbers and daemon diagnostics.
 *
 * The totals distinguish measured from unmeasured volumes rather than treating an
 * unmeasured volume as zero bytes. Reporting "0 B" for something never scanned would
 * quietly understate reclaimable space, which is the one number a user is likely to act
 * on.
 */
export const SystemService = Object.freeze({
  async summary(): Promise<SystemSummary> {
    const [volumes, graph] = await Promise.all([
      VolumeRepository.listAll(),
      DependencyService.buildGraph(),
    ]);
    const measurements = MeasurementRepository.latestForAll();

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
      volumeCount: volumes.length,
      inUseCount,
      reservedCount,
      orphanedCount,
      measuredBytes,
      reclaimableBytes,
      unmeasuredCount,
      queue: ScanQueue.stats(),
    };
  },

  async daemon(): Promise<DaemonInfo> {
    const reachable = await DockerClient.ping();
    const strategy = await ScannerService.describeStrategy();

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

    const [version, info] = await Promise.all([DockerClient.version(), DockerClient.info()]);

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

  async health(): Promise<HealthReport> {
    const daemon = await SystemService.daemon();
    return {
      status: daemon.reachable ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      daemon,
    };
  },
});
