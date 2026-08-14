import type { HostKind, HostProbeOutcome, HostStatus } from './enums.shared.js';

/**
 * SSH coordinates for a remote host.
 *
 * Note what is absent: no password, no passphrase, no private key. Leviosa stores a
 * *path* to a key and otherwise defers to the running SSH agent, so its database never
 * becomes a place credentials can leak from. The API rejects any payload that tries to
 * send key material.
 */
export interface DockerHostSsh {
  host: string;
  port: number;
  user: string;
  /** Path to a private key, or null to authenticate through the SSH agent. */
  keyPath: string | null;
}

export interface DockerHost {
  /** Stable slug, used as the path segment and as the storage key for all its data. */
  id: string;
  label: string;
  kind: HostKind;
  /** Present only for SSH hosts. */
  ssh: DockerHostSsh | null;
  status: HostStatus;
  /** Pinned host key, base64 SHA-256. Null until the operator has accepted one. */
  hostKeyFingerprint: string | null;
  enabled: boolean;
  createdAt: string;
  /** Last time the daemon answered, null if it never has. */
  lastSeenAt: string | null;
  /** True for the reserved local host, which cannot be deleted. */
  readOnly: boolean;
}

export interface CreateHostInput {
  /** Omit to derive a slug from the label. */
  id?: string;
  label: string;
  ssh: DockerHostSsh;
}

export interface UpdateHostInput {
  label?: string;
  ssh?: DockerHostSsh;
  enabled?: boolean;
}

/** Outcome of a connection probe, including anything the operator must act on. */
export interface HostConnectionTest {
  hostId: string;
  outcome: HostProbeOutcome;
  /** Human-facing explanation, safe to display verbatim. */
  detail: string;
  /**
   * Fingerprint the remote presented. Set when the outcome is FINGERPRINT_UNVERIFIED so
   * the UI can show it for comparison; confirming it is a separate, explicit call.
   */
  presentedFingerprint: string | null;
  /** Engine version, when the probe got far enough to ask. */
  daemonVersion: string | null;
  roundTripMs: number;
}

/** Body of the fingerprint confirmation call. */
export interface TrustHostKeyInput {
  fingerprint: string;
}
