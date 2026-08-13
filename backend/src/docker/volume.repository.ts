import type { VolumeInspectInfo } from 'dockerode';
import { ComposeLabel } from '@leviosa/shared';
import { CacheKey, Config } from '../config/index.config.js';
import { ApiErrors, Clock, TtlCache } from '../utils/index.utils.js';
import type { VolumeRecord } from '../types/internal.types.js';
import { DockerClient } from './docker.client.js';

const inventoryCache = TtlCache.create<VolumeRecord[]>(Config.docker.inventoryCacheMs);

interface VolumeInspectInfoWithCreation extends VolumeInspectInfo {
  /** Present on modern API versions; absent on older daemons. */
  CreatedAt?: string;
}

function _toRecord(info: VolumeInspectInfoWithCreation): VolumeRecord {
  const labels = info.Labels ?? {};
  return {
    name: info.Name,
    driver: info.Driver,
    scope: info.Scope ?? 'local',
    mountpoint: info.Mountpoint,
    createdAtMs: Clock.parseIso(info.CreatedAt ?? null),
    labels,
    composeProject: labels[ComposeLabel.PROJECT] ?? null,
  };
}

export const VolumeRepository = Object.freeze({
  async listAll(): Promise<VolumeRecord[]> {
    return inventoryCache.resolve(CacheKey.VOLUME_INVENTORY, async () => {
      try {
        const response = await DockerClient.raw().listVolumes();
        const volumes = (response.Volumes ?? []) as VolumeInspectInfoWithCreation[];
        return volumes.map(_toRecord);
      } catch (error) {
        throw DockerClient.toApiError(error, 'listing volumes');
      }
    });
  },

  /** Returns null when the volume does not exist, so callers can 404 deliberately. */
  async find(name: string): Promise<VolumeRecord | null> {
    try {
      const info = (await DockerClient.raw().getVolume(name).inspect()) as VolumeInspectInfoWithCreation;
      return _toRecord(info);
    } catch (error) {
      if (DockerClient.isNotFound(error)) {
        return null;
      }
      throw DockerClient.toApiError(error, `inspecting volume "${name}"`);
    }
  },

  /** Same as `find`, but raises the canonical 404 for controllers. */
  async findOrFail(name: string): Promise<VolumeRecord> {
    const record = await VolumeRepository.find(name);
    if (!record) {
      throw ApiErrors.volumeNotFound(name);
    }
    return record;
  },

  /**
   * Removes a volume. The daemon performs its own in-use check and answers 409; we
   * surface that as VOLUME_IN_USE even though the safety service should have caught
   * it first, because the inventory can change between the check and the call.
   */
  async remove(name: string): Promise<void> {
    try {
      await DockerClient.raw().getVolume(name).remove();
      inventoryCache.invalidate();
    } catch (error) {
      if (DockerClient.isNotFound(error)) {
        throw ApiErrors.volumeNotFound(name);
      }
      if (DockerClient.isConflict(error)) {
        throw ApiErrors.volumeInUse(name, {
          hint: 'The daemon rejected the removal. A container started referencing it moments ago.',
        });
      }
      throw DockerClient.toApiError(error, `removing volume "${name}"`);
    }
  },

  invalidate(): void {
    inventoryCache.invalidate();
  },
});
