import type { ContainerInfo } from 'dockerode';
import { ComposeLabel, LIVE_CONTAINER_STATES } from '@leviosa/shared';
import type { ContainerState } from '@leviosa/shared';
import { CacheKey, Config } from '../config/index.config.js';
import { Identifier, TtlCache } from '../utils/index.utils.js';
import type { ContainerRecord, ContainerVolumeMount } from '../types/internal.types.js';
import { DockerClient } from './docker.client.js';

const VOLUME_MOUNT_TYPE = 'volume';
const NAME_PREFIX = '/';

const inventoryCache = TtlCache.create<ContainerRecord[]>(Config.docker.inventoryCacheMs);

/** Docker prefixes every container name with a slash. */
function _readName(info: ContainerInfo): string {
  const [first] = info.Names ?? [];
  if (!first) {
    return Identifier.shortenContainerId(info.Id);
  }
  return first.startsWith(NAME_PREFIX) ? first.slice(NAME_PREFIX.length) : first;
}

/**
 * Only named-volume mounts matter here. Bind mounts and tmpfs entries are dropped:
 * they are not volumes and cannot be reclaimed by removing one.
 */
function _readVolumeMounts(info: ContainerInfo): ContainerVolumeMount[] {
  const mounts = info.Mounts ?? [];
  const named: ContainerVolumeMount[] = [];

  for (const mount of mounts) {
    if (mount.Type !== VOLUME_MOUNT_TYPE || !mount.Name) {
      continue;
    }
    named.push({
      volumeName: mount.Name,
      mountPath: mount.Destination,
      readOnly: mount.RW === false,
    });
  }

  return named;
}

function _readLabel(info: ContainerInfo, key: string): string | null {
  return info.Labels?.[key] ?? null;
}

function _toRecord(info: ContainerInfo): ContainerRecord {
  const state = info.State as ContainerState;
  return {
    id: info.Id,
    shortId: Identifier.shortenContainerId(info.Id),
    name: _readName(info),
    state,
    live: LIVE_CONTAINER_STATES.includes(state),
    image: info.Image,
    composeProject: _readLabel(info, ComposeLabel.PROJECT),
    composeService: _readLabel(info, ComposeLabel.SERVICE),
    volumeMounts: _readVolumeMounts(info),
  };
}

export const ContainerRepository = Object.freeze({
  /**
   * Every container, including stopped ones. Stopped containers still pin their
   * volumes as far as Docker is concerned, so excluding them would report volumes
   * as orphaned that the daemon will refuse to remove.
   */
  async listAll(): Promise<ContainerRecord[]> {
    return inventoryCache.resolve(CacheKey.CONTAINER_INVENTORY, async () => {
      try {
        const infos = await DockerClient.raw().listContainers({ all: true });
        return infos.map(_toRecord);
      } catch (error) {
        throw DockerClient.toApiError(error, 'listing containers');
      }
    });
  },

  invalidate(): void {
    inventoryCache.invalidate();
  },
});
