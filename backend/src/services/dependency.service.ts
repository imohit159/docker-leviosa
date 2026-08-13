import { VolumeUsage } from '@leviosa/shared';
import type { VolumeConsumer, VolumeUsageReport } from '@leviosa/shared';
import { ContainerRepository } from '../docker/index.docker.js';
import type { ContainerRecord, ContainerVolumeMount } from '../types/internal.types.js';

function _toConsumer(container: ContainerRecord, mount: ContainerVolumeMount): VolumeConsumer {
  return {
    containerId: container.id,
    containerShortId: container.shortId,
    containerName: container.name,
    state: container.state,
    live: container.live,
    mountPath: mount.mountPath,
    readOnly: mount.readOnly,
    image: container.image,
    composeProject: container.composeProject,
    composeService: container.composeService,
  };
}

/** Running containers first, then by name, so the UI's first row is the one that matters. */
function _byRelevance(left: VolumeConsumer, right: VolumeConsumer): number {
  if (left.live !== right.live) {
    return left.live ? -1 : 1;
  }
  return left.containerName.localeCompare(right.containerName);
}

/**
 * Answers "who is using this volume?" — the question `docker volume ls` cannot.
 *
 * The graph is built by inverting the container inventory once per request rather than
 * inspecting each volume individually: with V volumes and C containers, the naive
 * approach is V lookups against the daemon, while one container listing is O(1) calls
 * and yields every edge.
 */
export const DependencyService = Object.freeze({
  /** Volume name -> every container referencing it, running or not. */
  async buildGraph(): Promise<Map<string, VolumeConsumer[]>> {
    const containers = await ContainerRepository.listAll();
    const graph = new Map<string, VolumeConsumer[]>();

    for (const container of containers) {
      for (const mount of container.volumeMounts) {
        const consumers = graph.get(mount.volumeName) ?? [];
        consumers.push(_toConsumer(container, mount));
        graph.set(mount.volumeName, consumers);
      }
    }

    for (const consumers of graph.values()) {
      consumers.sort(_byRelevance);
    }

    return graph;
  },

  async consumersOf(volumeName: string): Promise<VolumeConsumer[]> {
    const graph = await DependencyService.buildGraph();
    return graph.get(volumeName) ?? [];
  },

  /**
   * Classifies a volume from its consumer list.
   *
   * The RESERVED class is the one people trip over: a volume referenced only by a
   * stopped container looks unused in every listing, but the daemon will still refuse
   * to remove it until that container is deleted.
   */
  summarize(consumers: readonly VolumeConsumer[]): VolumeUsageReport {
    const liveCount = consumers.filter((consumer) => consumer.live).length;
    const stoppedCount = consumers.length - liveCount;

    let status: VolumeUsage = VolumeUsage.ORPHANED;
    if (liveCount > 0) {
      status = VolumeUsage.IN_USE;
    } else if (stoppedCount > 0) {
      status = VolumeUsage.RESERVED;
    }

    return { status, liveCount, stoppedCount, consumers: [...consumers] };
  },
});
