import type { VolumeBrowseResult } from '@leviosa/shared';
import { VolumeRepository } from '../docker/index.docker.js';
import type { HostContext } from '../docker/index.docker.js';
import { ScannerService } from '../scanner/index.scanner.js';
import { ApiErrors, VolumePath } from '../utils/index.utils.js';
import { MeasurementMapper } from './measurement.mapper.js';

/**
 * Directory listing inside a volume: the "what's actually in there?" question.
 *
 * Listings are always computed live rather than served from the cached measurement.
 * A stale total is a reasonable trade-off, but a stale file listing is actively
 * misleading, and a depth-one listing is cheap compared with a full recursive walk.
 */
export const BrowseService = Object.freeze({
  async list(host: HostContext, volumeName: string, requestedPath: string): Promise<VolumeBrowseResult> {
    const normalized = VolumePath.normalize(requestedPath);
    if (normalized === null) {
      throw ApiErrors.pathTraversal(requestedPath);
    }

    const volume = await VolumeRepository.findOrFail(host, volumeName);
    const listing = await ScannerService.list(
      { host, volumeName: volume.name, mountpoint: volume.mountpoint },
      normalized,
    );

    return {
      hostId: host.hostId,
      volumeName: volume.name,
      path: normalized,
      parentPath: VolumePath.parentOf(normalized),
      entries: MeasurementMapper.toEntries(listing.entries, normalized),
      truncated: listing.truncated,
    };
  },
});
