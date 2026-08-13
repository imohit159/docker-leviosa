import { DeleteVerdict } from '@leviosa/shared';
import type { DeleteSafety, VolumeConsumer, VolumeUsageReport } from '@leviosa/shared';
import { PROTECTED_LABEL_PREFIXES } from '../config/index.config.js';
import type { VolumeRecord } from '../types/internal.types.js';

/** Formats a blocker list as `name (mounted at /path)` for the reason string. */
function _describe(consumers: readonly VolumeConsumer[]): string {
  return consumers.map((consumer) => `${consumer.containerName} (at ${consumer.mountPath})`).join(', ');
}

function _protectedLabel(volume: VolumeRecord): string | null {
  for (const key of Object.keys(volume.labels)) {
    const match = PROTECTED_LABEL_PREFIXES.find((prefix) => key.startsWith(prefix));
    if (match) {
      return key;
    }
  }
  return null;
}

/**
 * The pre-flight guard for destructive actions.
 *
 * Every verdict carries the specific containers that block it and what to do about
 * them, because "cannot delete: volume in use" is exactly the error message that sends
 * people to Stack Overflow. This runs on read, so the UI can disable the delete
 * affordance before anyone clicks it, and again immediately before the removal, since
 * the inventory can change in between.
 */
export const SafetyService = Object.freeze({
  evaluate(
    volume: VolumeRecord,
    usage: VolumeUsageReport,
    reclaimableBytes: number | null,
  ): DeleteSafety {
    const protectedKey = _protectedLabel(volume);
    if (protectedKey !== null) {
      return {
        deletable: false,
        verdict: DeleteVerdict.BLOCKED_BY_SYSTEM_LABEL,
        reason: `Carries the managed label "${protectedKey}", so it belongs to Docker itself or is explicitly pinned. Remove it with the tool that created it.`,
        blockers: [],
        reclaimableBytes,
      };
    }

    const live = usage.consumers.filter((consumer) => consumer.live);
    if (live.length > 0) {
      return {
        deletable: false,
        verdict: DeleteVerdict.BLOCKED_BY_RUNNING_CONTAINER,
        reason: `Currently mounted by ${_describe(live)}. Stop those containers before removing the volume; deleting the data underneath a running process is how databases get corrupted.`,
        blockers: live,
        reclaimableBytes,
      };
    }

    const stopped = usage.consumers.filter((consumer) => !consumer.live);
    if (stopped.length > 0) {
      return {
        deletable: false,
        verdict: DeleteVerdict.BLOCKED_BY_STOPPED_CONTAINER,
        reason: `Reserved by stopped ${stopped.length === 1 ? 'container' : 'containers'} ${_describe(stopped)}. The daemon keeps the reference until those containers are removed (\`docker rm\`), so it will reject the deletion.`,
        blockers: stopped,
        reclaimableBytes,
      };
    }

    return {
      deletable: true,
      verdict: DeleteVerdict.SAFE,
      reason: 'No container on this daemon references this volume, so removing it affects nothing that is currently defined.',
      blockers: [],
      reclaimableBytes,
    };
  },
});
