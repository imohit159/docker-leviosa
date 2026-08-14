import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Config, SshTransport } from '../config/index.config.js';
import { Logger } from '../utils/index.utils.js';

const log = Logger.for('ssh:known-hosts');

/** OpenSSH writes the default port bare and any other port in bracket form. */
const DEFAULT_SSH_PORT = 22;
const COMMENT_PREFIX = '#';
const HASHED_PREFIX = '|1|';
const HASHED_FIELD_SEPARATOR = '|';
const PATTERN_SEPARATOR = ',';
const NEGATION_PREFIX = '!';
/** Entries we refuse to treat as a match, whatever host they name. */
const IGNORED_MARKERS: readonly string[] = Object.freeze(['@cert-authority', '@revoked']);

export interface KnownHostEntry {
  patterns: readonly string[];
  hashedSalt: string | null;
  hashedValue: string | null;
  fingerprint: string;
}

/**
 * The OpenSSH SHA-256 fingerprint of a public key: base64 of the digest, padding
 * stripped, prefixed with the algorithm. Identical to what `ssh-keygen -lf` prints, so
 * an operator can compare ours against theirs character for character.
 */
function _fingerprintOf(key: Buffer): string {
  const digest = createHash(SshTransport.FINGERPRINT_ALGORITHM).update(key).digest('base64');
  return `${SshTransport.FINGERPRINT_PREFIX}${digest.replace(/=+$/, '')}`;
}

/** `host` for the default port, `[host]:port` otherwise, matching how OpenSSH records it. */
function _candidateNames(host: string, port: number): string[] {
  const lower = host.toLowerCase();
  return port === DEFAULT_SSH_PORT ? [lower] : [`[${lower}]:${String(port)}`];
}

/** OpenSSH glob subset: `*` spans any run, `?` one character. */
function _matchesGlob(pattern: string, candidate: string): boolean {
  if (!pattern.includes('*') && !pattern.includes('?')) {
    return pattern.toLowerCase() === candidate;
  }

  const expression = pattern
    .toLowerCase()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  return new RegExp(`^${expression}$`).test(candidate);
}

/**
 * Hashed entries store `|1|salt|HMAC-SHA1(salt, hostname)`, so the file never reveals
 * which hosts it covers. Matching therefore has to be recomputed per candidate.
 */
function _matchesHashed(salt: string, expected: string, candidate: string): boolean {
  try {
    const digest = createHmac('sha1', Buffer.from(salt, 'base64')).update(candidate).digest();
    const target = Buffer.from(expected, 'base64');
    return digest.length === target.length && timingSafeEqual(digest, target);
  } catch {
    return false;
  }
}

function _parseLine(line: string): KnownHostEntry | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith(COMMENT_PREFIX)) {
    return null;
  }

  const fields = trimmed.split(/\s+/);
  if (IGNORED_MARKERS.includes(fields[0] ?? '')) {
    return null;
  }

  const [hosts, , base64Key] = fields;
  if (hosts === undefined || base64Key === undefined) {
    return null;
  }

  let key: Buffer;
  try {
    key = Buffer.from(base64Key, 'base64');
  } catch {
    return null;
  }
  if (key.length === 0) {
    return null;
  }

  if (hosts.startsWith(HASHED_PREFIX)) {
    const [, salt, value] = hosts.slice(HASHED_PREFIX.length - 1).split(HASHED_FIELD_SEPARATOR);
    if (salt === undefined || value === undefined) {
      return null;
    }
    return { patterns: [], hashedSalt: salt, hashedValue: value, fingerprint: _fingerprintOf(key) };
  }

  return {
    patterns: hosts.split(PATTERN_SEPARATOR),
    hashedSalt: null,
    hashedValue: null,
    fingerprint: _fingerprintOf(key),
  };
}

export const KnownHosts = Object.freeze({
  fingerprintOf(key: Buffer): string {
    return _fingerprintOf(key);
  },

  /**
   * Fingerprints `known_hosts` already trusts for this endpoint.
   *
   * A missing or unreadable file yields an empty list rather than an error: not having
   * the file is a perfectly normal state, and it means "nothing is trusted yet", which
   * is exactly the answer the caller needs. It must never mean "trust anything".
   */
  async fingerprintsFor(host: string, port: number): Promise<string[]> {
    let contents: string;
    try {
      contents = await readFile(Config.ssh.knownHostsPath, 'utf8');
    } catch {
      log.debug({ path: Config.ssh.knownHostsPath }, 'known_hosts not readable; treating as empty');
      return [];
    }

    const candidates = _candidateNames(host, port);
    const matches: string[] = [];

    for (const line of contents.split('\n')) {
      const entry = _parseLine(line);
      if (entry === null) {
        continue;
      }

      if (entry.hashedSalt !== null && entry.hashedValue !== null) {
        if (candidates.some((name) => _matchesHashed(entry.hashedSalt ?? '', entry.hashedValue ?? '', name))) {
          matches.push(entry.fingerprint);
        }
        continue;
      }

      // A negated pattern excludes the whole entry, exactly as OpenSSH treats it.
      const negated = entry.patterns.filter((pattern) => pattern.startsWith(NEGATION_PREFIX));
      if (
        negated.some((pattern) =>
          candidates.some((name) => _matchesGlob(pattern.slice(NEGATION_PREFIX.length), name)),
        )
      ) {
        continue;
      }

      if (
        entry.patterns.some(
          (pattern) => !pattern.startsWith(NEGATION_PREFIX) && candidates.some((name) => _matchesGlob(pattern, name)),
        )
      ) {
        matches.push(entry.fingerprint);
      }
    }

    return matches;
  },
});
