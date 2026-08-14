import { z } from 'zod';
import type { ApiFieldIssue } from '@leviosa/shared';
import { SshTransport } from '../config/index.config.js';
import { ApiErrors, Schema } from '../utils/index.utils.js';

/**
 * Slugs become both a URL path segment and the storage key for every row belonging to
 * the host, so they are deliberately narrow: no encoding surprises, no case collisions.
 */
const HOST_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const HOST_ID_MAX = 64;
const LABEL_MAX = 80;
/**
 * SSH usernames are opaque strings on the wire. Digits may lead (e.g. `1o1`) — the old
 * POSIX "must start with a letter" rule is for `useradd`, not for OpenSSH clients.
 */
const SSH_USER_PATTERN = /^[a-z0-9_][a-z0-9_-]*\$?$/i;
const MAX_PORT = 65_535;

/**
 * Field names that must never be accepted, whatever else the payload contains.
 *
 * The strict schemas below already reject unknown keys, so this list changes no
 * outcome — it changes the explanation. Someone posting a private key should be told
 * that Leviosa refuses to store credentials, not "Unrecognized key: privateKey", which
 * reads like a typo and invites them to guess at the right field name instead.
 */
const FORBIDDEN_CREDENTIAL_FIELDS: readonly string[] = Object.freeze([
  'password',
  'passphrase',
  'privateKey',
  'private_key',
  'key',
  'secret',
  'token',
  'identity',
  'credentials',
]);

const CREDENTIAL_REJECTION_MESSAGE =
  'Leviosa never stores credentials. Supply "keyPath" pointing at a private key on this' +
  ' machine, or omit it to use the SSH agent.';

const hostIdSchema = z
  .string()
  .trim()
  .min(1, 'Host id is required.')
  .max(HOST_ID_MAX, `Host ids cannot exceed ${String(HOST_ID_MAX)} characters.`)
  .regex(HOST_ID_PATTERN, 'Host ids may contain lowercase letters, digits and dashes only.');

const sshSchema = z.strictObject({
  host: z.string().trim().min(1, 'An SSH hostname or address is required.'),
  port: z.coerce.number().int().min(1).max(MAX_PORT).default(SshTransport.DEFAULT_PORT),
  user: z
    .string()
    .trim()
    .min(1, 'An SSH username is required.')
    .regex(
      SSH_USER_PATTERN,
      'SSH usernames may contain letters, digits, underscores and hyphens only.',
    ),
  /** A path on the machine running this API, never the key itself. */
  keyPath: z.string().trim().min(1).nullable().default(null),
});

/**
 * Rejects credential-bearing keys anywhere in the payload, before the schema runs.
 *
 * It has to be a separate pass rather than a `superRefine`: Zod does not run
 * refinements once the object parse itself has failed, and a strict object fails on the
 * unknown key first — so the specific message would never be reached.
 */
function _assertNoCredentials(value: unknown): void {
  if (typeof value !== 'object' || value === null) {
    return;
  }

  const issues: ApiFieldIssue[] = [];

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_CREDENTIAL_FIELDS.includes(key)) {
      issues.push({ path: key, message: CREDENTIAL_REJECTION_MESSAGE });
    }
    if (typeof nested === 'object' && nested !== null) {
      for (const nestedKey of Object.keys(nested as Record<string, unknown>)) {
        if (FORBIDDEN_CREDENTIAL_FIELDS.includes(nestedKey)) {
          issues.push({ path: `${key}.${nestedKey}`, message: CREDENTIAL_REJECTION_MESSAGE });
        }
      }
    }
  }

  if (issues.length > 0) {
    throw ApiErrors.validation('This request carries credentials, which Leviosa will not accept.', issues);
  }
}

const createSchema = z.strictObject({
  id: hostIdSchema.optional(),
  label: z.string().trim().min(1, 'A label is required.').max(LABEL_MAX),
  ssh: sshSchema,
});

const updateSchema = z.strictObject({
  label: z.string().trim().min(1).max(LABEL_MAX).optional(),
  ssh: sshSchema.optional(),
  enabled: z.boolean().optional(),
});

const trustSchema = z.strictObject({
  fingerprint: z.string().trim().min(1, 'A fingerprint is required.'),
});

export type NormalizedCreateHost = z.output<typeof createSchema>;
export type NormalizedUpdateHost = z.output<typeof updateSchema>;
export type NormalizedTrustHostKey = z.output<typeof trustSchema>;

export const HostValidation = Object.freeze({
  hostId(value: unknown): string {
    return Schema.parse(hostIdSchema, value, 'host id');
  },

  create(value: unknown): NormalizedCreateHost {
    _assertNoCredentials(value);
    return Schema.parse(createSchema, value, 'host');
  },

  update(value: unknown): NormalizedUpdateHost {
    _assertNoCredentials(value);
    return Schema.parse(updateSchema, value, 'host update');
  },

  trust(value: unknown): NormalizedTrustHostKey {
    return Schema.parse(trustSchema, value, 'host key confirmation');
  },

  /** Derives a slug from a label when the caller did not supply an explicit id. */
  slugify(label: string): string {
    const slug = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, HOST_ID_MAX);
    return slug.length > 0 ? slug : 'host';
  },
});
