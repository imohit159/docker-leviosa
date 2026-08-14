import { LOCAL_HOST_ID } from '../config/index.config.js';
import { HostRepository } from '../store/index.store.js';
import type { StoredHost } from '../store/index.store.js';
import { ApiErrors, Logger } from '../utils/index.utils.js';
import { HostContextFactory } from './host-context.js';
import type { HostContext } from './host-context.js';

const log = Logger.for('docker:registry');

/**
 * Live transports, one per host, built on first use.
 *
 * Keyed by host id and never rebuilt implicitly: an SSH context owns a pooled
 * connection, so silently constructing a second one would leak the first and quietly
 * double the connection count against the remote.
 */
const contexts = new Map<string, HostContext>();

function _build(host: StoredHost): HostContext {
  const context = HostContextFactory.create(host);
  contexts.set(host.id, context);
  log.debug({ hostId: host.id, endpoint: context.endpointDescription }, 'host transport ready');
  return context;
}

export const HostRegistry = Object.freeze({
  /** Ensures the reserved local host exists and its transport is live. Called at boot. */
  bootstrap(): HostContext {
    const local = HostRepository.ensureLocal();
    return contexts.get(local.id) ?? _build(local);
  },

  /** Throws `HOST_NOT_FOUND` rather than returning null: every caller needs a host. */
  get(hostId: string): HostContext {
    const cached = contexts.get(hostId);
    if (cached) {
      return cached;
    }

    const host = HostRepository.find(hostId);
    if (host === null) {
      throw ApiErrors.hostNotFound(hostId);
    }
    return _build(host);
  },

  local(): HostContext {
    return HostRegistry.get(LOCAL_HOST_ID);
  },

  /** Transports for every enabled host, for background sweeps. */
  enabled(): HostContext[] {
    return HostRepository.findEnabled().map((host) => contexts.get(host.id) ?? _build(host));
  },

  /**
   * Drops a host's transport so the next request rebuilds it from the current record.
   *
   * Must be called whenever connection details or the pinned fingerprint change,
   * otherwise the pooled SSH connection would keep using the settings it was born with.
   */
  invalidate(hostId: string): void {
    const context = contexts.get(hostId);
    if (!context) {
      return;
    }
    context.dispose();
    contexts.delete(hostId);
    log.debug({ hostId }, 'host transport invalidated');
  },

  /** Closes every pooled connection. Called on shutdown. */
  disposeAll(): void {
    for (const context of contexts.values()) {
      context.dispose();
    }
    contexts.clear();
  },
});
