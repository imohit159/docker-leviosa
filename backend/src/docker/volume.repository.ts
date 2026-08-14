import type { VolumeInspectInfo } from 'dockerode';
import { ComposeLabel } from '@leviosa/shared';
import { CacheKey, Config } from '../config/index.config.js';
import { ApiErrors, Clock, TtlCache } from '../utils/index.utils.js';
import type { VolumeRecord } from '../types/internal.types.js';
import { DockerClient } from './docker.client.js';
import type { HostContext } from './host-context.js';

/** Shared instance, host-namespaced keys. See the note in `container.repository.ts`. */
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
  async listAll(host: HostContext): Promise<VolumeRecord[]> {
    return inventoryCache.resolve(CacheKey.for(host.hostId, CacheKey.VOLUME_INVENTORY), async () => {
      try {
        const response = await host.docker.listVolumes();
        const volumes = (response.Volumes ?? []) as VolumeInspectInfoWithCreation[];
        return volumes.map(_toRecord);
      } catch (error) {
        throw host.toApiError(error, 'listing volumes');
      }
    });
  },

  /** Returns null when the volume does not exist, so callers can 404 deliberately. */
  async find(host: HostContext, name: string): Promise<VolumeRecord | null> {
    try {
      const info = (await host.docker.getVolume(name).inspect()) as VolumeInspectInfoWithCreation;
      return _toRecord(info);
    } catch (error) {
      if (DockerClient.isNotFound(error)) {
        return null;
      }
      throw host.toApiError(error, `inspecting volume "${name}"`);
    }
  },

  /** Same as `find`, but raises the canonical 404 for controllers. */
  async findOrFail(host: HostContext, name: string): Promise<VolumeRecord> {
    const record = await VolumeRepository.find(host, name);
    if (!record) {
      throw ApiErrors.volumeNotFound(name, host.label);
    }
    return record;
  },

  /**
   * Removes a volume. The daemon performs its own in-use check and answers 409; we
   * surface that as VOLUME_IN_USE even though the safety service should have caught
   * it first, because the inventory can change between the check and the call.
   */
  async remove(host: HostContext, name: string): Promise<void> {
    try {
      await host.docker.getVolume(name).remove();
      VolumeRepository.invalidate(host);
    } catch (error) {
      if (DockerClient.isNotFound(error)) {
        throw ApiErrors.volumeNotFound(name, host.label);
      }
      if (DockerClient.isConflict(error)) {
        throw ApiErrors.volumeInUse(name, {
          hint: 'The daemon rejected the removal. A container started referencing it moments ago.',
        });
      }
      throw host.toApiError(error, `removing volume "${name}"`);
    }
  },

  invalidate(host: HostContext): void {
    inventoryCache.invalidate(CacheKey.for(host.hostId, CacheKey.VOLUME_INVENTORY));
  },
});
