import type { AuditAction } from '../config/index.config.js';
import { Table } from '../config/index.config.js';
import { Clock, Logger } from '../utils/index.utils.js';
import { SqliteClient } from './sqlite.client.js';

const log = Logger.for('store:audit');

export interface AuditEvent {
  id: number;
  hostId: string;
  action: AuditAction;
  volumeName: string | null;
  payload: Record<string, unknown>;
  createdAtMs: number;
}

interface AuditRow {
  id: number;
  host_id: string;
  action: string;
  volume_name: string | null;
  payload: string | null;
  created_at: number;
}

/**
 * Append-only trail of consequential actions. A tool that can delete 48 GB of
 * someone's data owes them a record of who told it to, and it is also the only way to
 * explain after the fact why a volume is gone.
 */
export const AuditRepository = Object.freeze({
  record(
    hostId: string,
    action: AuditAction,
    volumeName: string | null,
    payload: Record<string, unknown> = {},
  ): void {
    try {
      SqliteClient.execute(
        `INSERT INTO ${Table.AUDIT} (host_id, action, volume_name, payload, created_at) VALUES (?, ?, ?, ?, ?)`,
        hostId,
        action,
        volumeName,
        JSON.stringify(payload),
        Clock.nowMs(),
      );
    } catch (error) {
      // Auditing must never be the reason a user-facing action fails.
      log.warn({ err: error, hostId, action, volumeName }, 'failed to write audit event');
    }
  },

  recent(hostId: string, limit: number): AuditEvent[] {
    const rows = SqliteClient.select<AuditRow>(
      `SELECT id, host_id, action, volume_name, payload, created_at
       FROM ${Table.AUDIT} WHERE host_id = ? ORDER BY created_at DESC LIMIT ?`,
      hostId,
      limit,
    );

    return rows.map((row) => ({
      id: row.id,
      hostId: row.host_id,
      action: row.action as AuditAction,
      volumeName: row.volume_name,
      payload: _parsePayload(row.payload),
      createdAtMs: row.created_at,
    }));
  },

  /** Removes a host's trail when the host is deregistered. */
  forgetHost(hostId: string): number {
    return SqliteClient.execute(`DELETE FROM ${Table.AUDIT} WHERE host_id = ?`, hostId);
  },
});

function _parsePayload(json: string | null): Record<string, unknown> {
  if (!json) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
