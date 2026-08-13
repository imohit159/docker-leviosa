import { MillisIn } from '@leviosa/shared';
import type { VolumeSighting } from '@leviosa/shared';
import { Config } from '../config/index.config.js';
import { VolumeRepository } from '../docker/index.docker.js';
import { SightingRepository } from '../store/index.store.js';
import type { StoredSighting } from '../store/index.store.js';
import { Clock, Logger } from '../utils/index.utils.js';
import { DependencyService } from './dependency.service.js';

const log = Logger.for('sighting');

/**
 * Maintains and presents the attachment ledger.
 *
 * Worth restating because it drives the whole design: the Docker Engine exposes no
 * "last used" timestamp for a volume. `docker volume inspect` gives you a creation
 * date and a mountpoint, full stop. Once the last container referencing a volume is
 * removed, the daemon retains no evidence the relationship ever existed. So a claim
 * like "last mounted 48 days ago" cannot be derived from Docker at all — it can only
 * be observed. This service does the observing and is candid about how far back its
 * knowledge reaches.
 */
export const SightingService = Object.freeze({
  /**
   * One polling round: records, for every volume on the daemon, whether it was
   * attached to anything at this instant.
   */
  async refresh(): Promise<number> {
    const [volumes, graph] = await Promise.all([
      VolumeRepository.listAll(),
      DependencyService.buildGraph(),
    ]);

    const observations = volumes.map((volume) => ({
      volumeName: volume.name,
      consumerNames: (graph.get(volume.name) ?? []).map((consumer) => consumer.containerName),
    }));

    SightingRepository.observe(observations);
    log.debug({ volumes: observations.length }, 'attachment ledger updated');
    return observations.length;
  },

  /**
   * Projects a ledger row for the wire.
   *
   * `trackingReliable` is false until we have watched a volume for at least
   * SIGHTING_TRUST_AFTER_DAYS, so a fresh install cannot imply that a volume has been
   * idle for ages when the truth is that we only started looking this morning.
   */
  present(stored: StoredSighting | null): VolumeSighting | null {
    if (!stored) {
      return null;
    }

    const now = Clock.nowMs();
    const observedForMs = now - stored.firstSeenAtMs;
    const trustThresholdMs = Config.scheduler.sightingTrustAfterDays * MillisIn.DAY;

    return {
      firstSeenAt: new Date(stored.firstSeenAtMs).toISOString(),
      lastSeenAt: new Date(stored.lastSeenAtMs).toISOString(),
      lastSeenAttachedAt: Clock.toIso(stored.lastSeenAttachedAtMs),
      idleDays: Clock.daysSince(stored.lastSeenAttachedAtMs, now),
      trackingReliable: observedForMs >= trustThresholdMs,
    };
  },
});
