import { HostKind } from '@leviosa/shared';
import { LOCAL_HOST_ID, LOCAL_HOST_LABEL, Table } from '../config/index.config.js';
import { Clock, Logger } from '../utils/index.utils.js';
import { SqliteClient } from './sqlite.client.js';

const log = Logger.for('store:host');

/** SSH coordinates for a remote host. Never carries key material, only a path to it. */
export interface StoredHostSsh {
  host: string;
  port: number;
  user: string;
  /**
   * Path to a private key, or `null` to rely on the running agent.
   *
   * A path, never the key itself: this database is an unencrypted local file, and a
   * tool that reads volume sizes has no business being a place where private keys go
   * missing from.
   */
  keyPath: string | null;
}

export interface StoredHost {
  id: string;
  label: string;
  kind: HostKind;
  /** Populated only when `kind` is SSH. */
  ssh: StoredHostSsh | null;
  /** Pinned on first successful connect, then required to match on every later one. */
  hostKeyFingerprint: string | null;
  enabled: boolean;
  createdAtMs: number;
  lastSeenAtMs: number | null;
}

export interface HostUpsertInput {
  id: string;
  label: string;
  kind: HostKind;
  ssh: StoredHostSsh | null;
}

interface HostRow {
  id: string;
  label: string;
  kind: string;
  ssh_host: string | null;
  ssh_port: number | null;
  ssh_user: string | null;
  ssh_key_path: string | null;
  host_key_fingerprint: string | null;
  enabled: number;
  created_at: number;
  last_seen_at: number | null;
}

const SELECT_COLUMNS = `id, label, kind, ssh_host, ssh_port, ssh_user, ssh_key_path,
  host_key_fingerprint, enabled, created_at, last_seen_at`;

function _toStored(row: HostRow): StoredHost {
  const kind = row.kind as HostKind;

  return {
    id: row.id,
    label: row.label,
    kind,
    ssh:
      kind === HostKind.SSH && row.ssh_host !== null && row.ssh_port !== null && row.ssh_user !== null
        ? { host: row.ssh_host, port: row.ssh_port, user: row.ssh_user, keyPath: row.ssh_key_path }
        : null,
    hostKeyFingerprint: row.host_key_fingerprint,
    enabled: row.enabled === 1,
    createdAtMs: row.created_at,
    lastSeenAtMs: row.last_seen_at,
  };
}

/**
 * The host registry: which daemons Leviosa knows about and how to reach them.
 *
 * Every volume row in the database hangs off one of these ids, so this table is the
 * anchor of the whole multi-host model.
 */
export const HostRepository = Object.freeze({
  /**
   * Guarantees the reserved local host exists. Called at boot.
   *
   * The row is created by migration v2 for existing databases, but a freshly wiped
   * `docker_host` table would otherwise leave the local daemon unaddressable, and the
   * label is left alone on purpose so an operator rename is not reverted on restart.
   */
  ensureLocal(): StoredHost {
    const existing = HostRepository.find(LOCAL_HOST_ID);
    if (existing) {
      return existing;
    }

    SqliteClient.execute(
      `INSERT INTO ${Table.HOST} (id, label, kind, enabled, created_at) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT (id) DO NOTHING`,
      LOCAL_HOST_ID,
      LOCAL_HOST_LABEL,
      HostKind.LOCAL,
      Clock.nowMs(),
    );

    const created = HostRepository.find(LOCAL_HOST_ID);
    if (!created) {
      throw new Error('failed to seed the local host row');
    }

    log.info({ hostId: LOCAL_HOST_ID }, 'seeded local host');
    return created;
  },

  findAll(): StoredHost[] {
    const rows = SqliteClient.select<HostRow>(
      `SELECT ${SELECT_COLUMNS} FROM ${Table.HOST} ORDER BY (id = ?) DESC, label ASC`,
      LOCAL_HOST_ID,
    );
    return rows.map(_toStored);
  },

  /** Hosts a background sweep should touch. */
  findEnabled(): StoredHost[] {
    return HostRepository.findAll().filter((host) => host.enabled);
  },

  find(id: string): StoredHost | null {
    const row = SqliteClient.selectOne<HostRow>(`SELECT ${SELECT_COLUMNS} FROM ${Table.HOST} WHERE id = ?`, id);
    return row ? _toStored(row) : null;
  },

  create(input: HostUpsertInput): StoredHost {
    SqliteClient.execute(
      `INSERT INTO ${Table.HOST}
        (id, label, kind, ssh_host, ssh_port, ssh_user, ssh_key_path, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      input.id,
      input.label,
      input.kind,
      input.ssh?.host ?? null,
      input.ssh?.port ?? null,
      input.ssh?.user ?? null,
      input.ssh?.keyPath ?? null,
      Clock.nowMs(),
    );

    const created = HostRepository.find(input.id);
    if (!created) {
      throw new Error(`host ${input.id} vanished immediately after insert`);
    }
    return created;
  },

  /**
   * Applies a partial change. Rewriting the SSH endpoint clears the pinned fingerprint,
   * because a different address is a different machine until proven otherwise, and
   * carrying the old pin forward would silently accept whatever answers next.
   */
  update(id: string, patch: { label?: string; ssh?: StoredHostSsh | null; enabled?: boolean }): StoredHost | null {
    const existing = HostRepository.find(id);
    if (!existing) {
      return null;
    }

    const ssh = patch.ssh === undefined ? existing.ssh : patch.ssh;
    const endpointChanged =
      ssh?.host !== existing.ssh?.host || ssh?.port !== existing.ssh?.port || ssh?.user !== existing.ssh?.user;

    SqliteClient.execute(
      `UPDATE ${Table.HOST} SET label = ?, ssh_host = ?, ssh_port = ?, ssh_user = ?, ssh_key_path = ?,
        host_key_fingerprint = ?, enabled = ? WHERE id = ?`,
      patch.label ?? existing.label,
      ssh?.host ?? null,
      ssh?.port ?? null,
      ssh?.user ?? null,
      ssh?.keyPath ?? null,
      endpointChanged ? null : existing.hostKeyFingerprint,
      (patch.enabled ?? existing.enabled) ? 1 : 0,
      id,
    );

    return HostRepository.find(id);
  },

  /**
   * Removes a host and the derived data belonging to it.
   *
   * Measurements and sightings go: they are a per-daemon cache and time series that
   * mean nothing without the host. Audit rows stay, because they record destructive
   * actions a human took and deleting the host is not a licence to erase that history —
   * they simply keep pointing at an id that no longer resolves.
   */
  remove(id: string): boolean {
    return SqliteClient.transaction(() => {
      const removed = SqliteClient.execute(`DELETE FROM ${Table.HOST} WHERE id = ?`, id);
      if (removed === 0) {
        return false;
      }

      SqliteClient.execute(`DELETE FROM ${Table.MEASUREMENT} WHERE host_id = ?`, id);
      SqliteClient.execute(`DELETE FROM ${Table.SIGHTING} WHERE host_id = ?`, id);
      log.info({ hostId: id }, 'removed host and its derived measurements');
      return true;
    });
  },

  /** Records that the daemon answered, for the "last reachable" readout. */
  markSeen(id: string): void {
    SqliteClient.execute(`UPDATE ${Table.HOST} SET last_seen_at = ? WHERE id = ?`, Clock.nowMs(), id);
  },

  /** Trust-on-first-use: stores the key an operator has explicitly accepted. */
  pinFingerprint(id: string, fingerprint: string): void {
    SqliteClient.execute(`UPDATE ${Table.HOST} SET host_key_fingerprint = ? WHERE id = ?`, fingerprint, id);
  },
});
