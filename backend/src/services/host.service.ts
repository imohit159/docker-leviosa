import { HostKind, HostProbeOutcome, HostStatus } from '@leviosa/shared';
import type { DockerHost, HostConnectionTest } from '@leviosa/shared';
import { LOCAL_HOST_ID } from '../config/index.config.js';
import { HostRegistry, SidecarRunner, SshConnectionError, SshFailure } from '../docker/index.docker.js';
import type { HostContext } from '../docker/index.docker.js';
import { AuditRepository, HostRepository, MeasurementRepository, SightingRepository } from '../store/index.store.js';
import type { StoredHost } from '../store/index.store.js';
import { ApiErrors, Clock, Logger } from '../utils/index.utils.js';
import type { NormalizedCreateHost, NormalizedUpdateHost } from '../validations/index.validations.js';
import { HostValidation } from '../validations/index.validations.js';

const log = Logger.for('host-service');

/** Maps a transport failure onto the outcome the operator needs to act on. */
function _outcomeOf(error: unknown): { outcome: HostProbeOutcome; detail: string; fingerprint: string | null } {
  if (error instanceof SshConnectionError) {
    const byKind: Record<SshFailure, HostProbeOutcome> = {
      [SshFailure.UNVERIFIED_HOST_KEY]: HostProbeOutcome.FINGERPRINT_UNVERIFIED,
      [SshFailure.AUTH_REJECTED]: HostProbeOutcome.AUTH_FAILED,
      [SshFailure.UNREACHABLE]: HostProbeOutcome.SSH_UNREACHABLE,
      [SshFailure.NO_CHANNEL]: HostProbeOutcome.DAEMON_UNREACHABLE,
    };
    return { outcome: byKind[error.kind], detail: error.message, fingerprint: error.presentedFingerprint };
  }

  return {
    outcome: HostProbeOutcome.DAEMON_UNREACHABLE,
    detail: error instanceof Error ? error.message : 'The daemon did not respond.',
    fingerprint: null,
  };
}

function _statusOf(host: StoredHost): HostStatus {
  if (!host.enabled) {
    return HostStatus.DISABLED;
  }
  // Reachability is not probed here: rendering the host list must not fan out an SSH
  // connect per row. Live status comes from the health endpoint.
  return host.lastSeenAtMs === null ? HostStatus.OFFLINE : HostStatus.ONLINE;
}

function _toWire(host: StoredHost): DockerHost {
  return {
    id: host.id,
    label: host.label,
    kind: host.kind,
    ssh: host.ssh,
    status: _statusOf(host),
    hostKeyFingerprint: host.hostKeyFingerprint,
    enabled: host.enabled,
    createdAt: new Date(host.createdAtMs).toISOString(),
    lastSeenAt: Clock.toIso(host.lastSeenAtMs),
    readOnly: host.id === LOCAL_HOST_ID,
  };
}

function _requireStored(hostId: string): StoredHost {
  const host = HostRepository.find(hostId);
  if (host === null) {
    throw ApiErrors.hostNotFound(hostId);
  }
  return host;
}

function _refuseLocalMutation(hostId: string, action: string): void {
  if (hostId === LOCAL_HOST_ID) {
    throw ApiErrors.hostProtected(
      `The local host cannot be ${action}. It is how this process reaches its own daemon.`,
    );
  }
}

export const HostService = Object.freeze({
  list(): DockerHost[] {
    HostRepository.ensureLocal();
    return HostRepository.findAll().map(_toWire);
  },

  find(hostId: string): DockerHost {
    return _toWire(_requireStored(hostId));
  },

  create(input: NormalizedCreateHost): DockerHost {
    const id = input.id ?? HostValidation.slugify(input.label);
    if (HostRepository.find(id) !== null) {
      throw ApiErrors.hostAlreadyExists(id);
    }

    const created = HostRepository.create({
      id,
      label: input.label,
      kind: HostKind.SSH,
      ssh: input.ssh,
    });

    log.info({ hostId: id, sshHost: created.ssh?.host }, 'host registered');
    return _toWire(created);
  },

  update(hostId: string, patch: NormalizedUpdateHost): DockerHost {
    const existing = _requireStored(hostId);
    if (patch.ssh !== undefined) {
      _refuseLocalMutation(hostId, 'given SSH connection details');
    }

    const updated = HostRepository.update(hostId, {
      label: patch.label,
      ssh: patch.ssh ?? existing.ssh,
      enabled: patch.enabled,
    });
    if (updated === null) {
      throw ApiErrors.hostNotFound(hostId);
    }

    // The pooled connection was built from the old record, so it must be discarded
    // rather than left serving requests with superseded settings.
    HostRegistry.invalidate(hostId);
    SidecarRunner.forgetImage(hostId);

    return _toWire(updated);
  },

  remove(hostId: string): void {
    _refuseLocalMutation(hostId, 'removed');
    _requireStored(hostId);

    HostRegistry.invalidate(hostId);
    SidecarRunner.forgetImage(hostId);
    MeasurementRepository.forgetHost(hostId);
    SightingRepository.forgetHost(hostId);
    AuditRepository.forgetHost(hostId);
    HostRepository.remove(hostId);

    log.info({ hostId }, 'host deregistered');
  },

  /**
   * Opens the connection and asks the daemon for its version.
   *
   * Deliberately end to end rather than a TCP check: the failure modes an operator
   * actually hits are an unverified host key, a rejected key, and SSH working while the
   * login user cannot reach the Docker socket. Only a real Engine call distinguishes
   * those, and each maps to a different fix.
   */
  async test(hostId: string): Promise<HostConnectionTest> {
    const stored = _requireStored(hostId);
    const startedAt = Date.now();

    let host: HostContext;
    try {
      host = HostRegistry.get(hostId);
    } catch (error) {
      const { outcome, detail, fingerprint } = _outcomeOf(error);
      return {
        hostId,
        outcome,
        detail,
        presentedFingerprint: fingerprint,
        daemonVersion: null,
        roundTripMs: Date.now() - startedAt,
      };
    }

    try {
      const version = await host.docker.version();
      HostRepository.markSeen(hostId);

      return {
        hostId,
        outcome: HostProbeOutcome.OK,
        detail: `Connected to ${stored.label} and the daemon answered.`,
        presentedFingerprint: host.sshAgent?.presentedFingerprint() ?? null,
        daemonVersion: version.Version,
        roundTripMs: Date.now() - startedAt,
      };
    } catch (error) {
      // The agent records the specific reason during the handshake; the error surfacing
      // from dockerode is the generic socket failure that followed it.
      const failure = host.sshAgent?.failure() ?? error;
      const { outcome, detail, fingerprint } = _outcomeOf(failure);

      log.warn({ hostId, outcome }, 'host connection test failed');

      return {
        hostId,
        outcome,
        detail,
        presentedFingerprint: fingerprint ?? host.sshAgent?.presentedFingerprint() ?? null,
        daemonVersion: null,
        roundTripMs: Date.now() - startedAt,
      };
    }
  },

  /**
   * Pins a host key the operator has explicitly accepted.
   *
   * Separate from `test` on purpose: trust-on-first-use is only meaningful if accepting
   * the key is a distinct, deliberate act. Auto-pinning whatever answered would reduce
   * the whole verification step to theatre.
   */
  trust(hostId: string, fingerprint: string): DockerHost {
    const stored = _requireStored(hostId);
    if (stored.kind !== HostKind.SSH) {
      throw ApiErrors.hostProtected('Only SSH hosts have a host key to trust.');
    }

    HostRepository.pinFingerprint(hostId, fingerprint);
    HostRegistry.invalidate(hostId);

    log.info({ hostId }, 'host key fingerprint pinned');
    return _toWire(_requireStored(hostId));
  },
});
