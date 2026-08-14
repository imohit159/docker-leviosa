/**
 * Compile-time constants. Anything that would otherwise appear as an inline
 * literal in a service belongs here; anything an operator may want to change at
 * deploy time belongs in `env.config.ts` instead.
 */

export const AppMeta = Object.freeze({
  NAME: 'docker-leviosa',
  SERVICE: 'leviosa-api',
} as const);

export const NodeEnv = Object.freeze({
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test',
} as const);
export type NodeEnv = (typeof NodeEnv)[keyof typeof NodeEnv];

export const HttpStatus = Object.freeze({
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const);
export type HttpStatus = (typeof HttpStatus)[keyof typeof HttpStatus];

export const HttpHeader = Object.freeze({
  REQUEST_ID: 'x-request-id',
} as const);

/** Everything about the throwaway measurement container. */
export const Sidecar = Object.freeze({
  /** Mount target inside the sidecar. Read-only, always this path. */
  MOUNT_TARGET: '/leviosa-target',
  /** Prefix for generated container names so strays are identifiable. */
  NAME_PREFIX: 'leviosa-scan',
  /** Stamped on our containers so we can find and reap orphans of our own making. */
  OWNER_LABEL: 'io.leviosa.owner',
  OWNER_VALUE: 'docker-leviosa',
  ROLE_LABEL: 'io.leviosa.role',
  ROLE_SCANNER: 'volume-scanner',
  /** Sidecars run as root: volume payloads are routinely owned by foreign uids. */
  USER: '0:0',
  /** Hard resource ceilings so a runaway scan cannot hurt the host. */
  MEMORY_BYTES: 128 * 1024 * 1024,
  PIDS_LIMIT: 64,
  /** No network is ever required to stat files. */
  NETWORK_MODE: 'none',
  /** Grace period handed to `docker kill` before we stop waiting on it. */
  KILL_SIGNAL: 'SIGKILL',
} as const);

/**
 * Wire format emitted by the in-container shell script. The script does no string
 * parsing of its own — it emits raw records and Node interprets them, because sh
 * word splitting is hostile to filenames containing spaces, quotes or newlines.
 */
export const ScanProtocol = Object.freeze({
  PREFIX: 'LEV',
  DELIMITER: '|',
  Record: Object.freeze({
    /** `BASE|<absolute path>`: the symlink-resolved directory the scan ran against. */
    BASE: 'BASE',
    /** `DU|<kib>|<absolute path>`: one `du -d 1` line. Includes BASE itself as the total. */
    DU: 'DU',
    /** `STAT|<kind>|<bytes>|<mtime seconds>|<absolute path>`: one depth-one child. */
    STAT: 'STAT',
    FILE_COUNT: 'FILE_COUNT',
    /** Includes BASE itself; the parser subtracts one. */
    DIR_COUNT: 'DIR_COUNT',
    /** `LAST_WRITE|<epoch seconds>`: newest mtime anywhere beneath BASE. */
    LAST_WRITE: 'LAST_WRITE',
    /** Emitted when the depth-one listing hit the entry cap. */
    TRUNCATED: 'TRUNCATED',
    ERROR: 'ERROR',
    /** Sentinel proving the script ran to completion rather than being killed. */
    END: 'END',
  } as const),
  EntryKind: Object.freeze({
    DIRECTORY: 'd',
    FILE: 'f',
    SYMLINK: 'l',
    OTHER: 'o',
  } as const),
  /** Error tokens the script can raise; mapped to API error codes by the caller. */
  Error: Object.freeze({
    NOT_A_DIRECTORY: 'NOT_A_DIRECTORY',
    OUTSIDE_ROOT: 'OUTSIDE_ROOT',
  } as const),
  /** Environment variable names the script reads. */
  Env: Object.freeze({
    ROOT: 'LEV_ROOT',
    PATH: 'LEV_PATH',
    MODE: 'LEV_MODE',
    WITH_LAST_WRITE: 'LEV_WITH_LAST_WRITE',
    MAX_ENTRIES: 'LEV_MAX_ENTRIES',
  } as const),
  Mode: Object.freeze({
    /** Recursive totals for the whole volume plus a root-level breakdown. */
    MEASURE: 'measure',
    /** Depth-one listing of a single directory. */
    LIST: 'list',
  } as const),
} as const);
export type ScanMode = (typeof ScanProtocol.Mode)[keyof typeof ScanProtocol.Mode];

/** SQLite table and column identifiers. */
export const Table = Object.freeze({
  MEASUREMENT: 'volume_measurement',
  SIGHTING: 'volume_sighting',
  AUDIT: 'audit_event',
  META: 'schema_meta',
  HOST: 'docker_host',
} as const);

/**
 * Key under which the applied schema version is recorded in `Table.META`.
 *
 * There is deliberately no companion `SCHEMA_VERSION` constant. The target version is
 * derived from the migration list, because a hand-maintained number can be bumped
 * without a migration to match — which is exactly how a version 1 database once got
 * stamped as version 2 and then skipped the migration that would have fixed it.
 */
export const SCHEMA_VERSION_KEY = 'schema_version';

/**
 * Reserved id for the daemon this process reaches directly, via socket or named pipe.
 *
 * Every pre-multi-host row is backfilled to this id, so it must never be reassigned:
 * changing it would orphan the entire existing measurement history.
 */
export const LOCAL_HOST_ID = 'local';

/** Default display name for the seeded local host; the operator can rename it. */
export const LOCAL_HOST_LABEL = 'This machine';

/**
 * SSH transport settings.
 *
 * `dockerode` can take an `ssh://` host itself, but `docker-modem` builds a fresh
 * `ssh2` connection per HTTP request and closes it when the response stream ends, so
 * every Engine call would pay a full handshake. We supply our own pooled agent
 * instead and drive these two remote entry points directly.
 */
export const SshTransport = Object.freeze({
  DEFAULT_PORT: 22,
  /**
   * Preferred: the Engine's own stdio proxy. Needs the docker CLI on the remote and
   * the login user in the `docker` group. Docker 18.09 and newer.
   */
  DIAL_STDIO_COMMAND: 'docker system dial-stdio',
  /**
   * Fallback: OpenSSH unix-socket forwarding straight to the daemon socket. Works
   * without the docker CLI, so it covers minimal images the stdio proxy cannot.
   */
  REMOTE_SOCKET_PATH: '/var/run/docker.sock',
  /** Local half of a forwarded unix socket. OpenSSH ignores it; ssh2 requires it. */
  FORWARD_LOCAL_HOST: 'localhost',
  FORWARD_LOCAL_PORT: 0,
  /** Digest used when presenting an unknown host key to the operator. */
  FINGERPRINT_ALGORITHM: 'sha256',
  FINGERPRINT_PREFIX: 'SHA256:',
} as const);

/** Audit trail action names. */
export const AuditAction = Object.freeze({
  VOLUME_DELETED: 'VOLUME_DELETED',
  VOLUME_DELETE_BLOCKED: 'VOLUME_DELETE_BLOCKED',
  SCAN_COMPLETED: 'SCAN_COMPLETED',
  SCAN_FAILED: 'SCAN_FAILED',
} as const);
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/** Volume label prefixes we refuse to delete through this tool. */
export const PROTECTED_LABEL_PREFIXES: readonly string[] = Object.freeze([
  'com.docker.desktop',
  'io.leviosa.protected',
]);

/**
 * Where the Engine API listens, per platform.
 *
 * Docker Desktop on Windows publishes the Engine over a named pipe; `/var/run/docker.sock`
 * is not merely absent there, it is unrepresentable. Defaulting every platform to the
 * unix socket makes the API come up "healthy", report `daemonReachable: false`, and
 * answer every data endpoint with a 503 whose only clue is `connect ENOENT
 * /var/run/docker.sock` — which reads like a broken install rather than a wrong path.
 *
 * macOS and Linux both keep the conventional unix socket, so one branch covers it.
 * Anything unusual (rootless, a remote daemon, a colima socket) is what DOCKER_HOST is
 * for and overrides this entirely.
 */
export const DockerEndpoint = Object.freeze({
  WINDOWS_PIPE: '//./pipe/docker_engine',
  UNIX_SOCKET: '/var/run/docker.sock',
} as const);

/** Docker Engine API error codes we translate rather than leak. */
export const DockerErrno = Object.freeze({
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const);

/** Socket-level failures that mean "the daemon is not there". */
export const UNREACHABLE_SYSCALL_CODES: readonly string[] = Object.freeze([
  'ENOENT',
  'ECONNREFUSED',
  'EACCES',
  'EPERM',
  'ECONNRESET',
  'ETIMEDOUT',
]);

/** Cache key namespaces for the in-process inventory cache. */
export const CacheKey = Object.freeze({
  CONTAINER_INVENTORY: 'container-inventory',
  VOLUME_INVENTORY: 'volume-inventory',
  DAEMON_INFO: 'daemon-info',
  SCAN_STRATEGY: 'scan-strategy',

  /**
   * Namespaces a key to one host. Mandatory for every cached daemon read: the bare
   * keys above are process-global, so without this a second host would be served the
   * first host's container and volume inventory until the TTL lapsed.
   */
  for(hostId: string, key: string): string {
    return `${hostId}${CACHE_KEY_SEPARATOR}${key}`;
  },
} as const);

const CACHE_KEY_SEPARATOR = '::';

/**
 * Composite identity for anything keyed per volume in memory.
 *
 * Volume names are unique per daemon, not globally, so `postgres_data` on two hosts is
 * two different volumes. Every in-process map that used a bare name needs this.
 */
export const HOST_VOLUME_SEPARATOR = '/';

/** Sub-directory of the daemon storage root that holds local volume data. */
export const DOCKER_VOLUMES_DIRNAME = 'volumes';
