# Leviosa — Docker volume insight

`docker volume ls` tells you a volume exists. It will not tell you how big it is, what is
inside it, which container depends on it, or whether deleting it destroys something you
need. Answering those questions by hand means `docker volume inspect`, then `du` against a
root-owned path, then `docker inspect` across every container, then grepping Compose files.

Leviosa answers all four from one screen:

1. **Discover** every volume on the daemon.
2. **Measure** size and contents, including a per-directory breakdown.
3. **Map dependencies** — which containers mount it, at which path, running or not.
4. **Classify and guard** — detect orphans, and refuse unsafe deletions with a reason.

---

## Table of contents

- [Architecture](#architecture)
- [Two decisions worth understanding](#two-decisions-worth-understanding)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [API](#api)
- [Project layout](#project-layout)
- [Conventions](#conventions)
- [Operational notes](#operational-notes)
- [Deliberate limitations](#deliberate-limitations)

---

## Architecture

Three workspaces in one npm monorepo, with the API and the UI fully separated:

```
docker-leviosa/
├── shared/     @leviosa/shared    Transport contracts: types, enums, routes, formatters
├── backend/    @leviosa/backend   Express + TypeScript API over the Docker Engine API
└── frontend/   @leviosa/frontend  Next.js dashboard
```

`shared` is compiled to `dist/` and consumed by both sides. Route paths, error codes, enum
values and byte/time formatting are declared exactly once, so the client cannot drift from
the server on a URL shape or a status string.

Request flow:

```
Browser ──HTTP──▶ Express ──▶ services ──▶ Docker Engine API (dockerode, unix socket)
                     │                └──▶ ephemeral sidecar container (measurement)
                     └──▶ SQLite (measurement history, sighting ledger, audit trail)
```

## Two decisions worth understanding

Everything else in this codebase is ordinary. These two are not, and they are the reason
the tool works at all.

### Volumes are measured from inside a container

The obvious implementation is `du -sh /var/lib/docker/volumes/<name>/_data`. It is also the
wrong one. That path is `root:root` mode `0700`, so an ordinary user in the `docker` group
gets `EACCES` — and it does not exist at all on Docker Desktop (the daemon runs inside a
LinuxKit VM), on a rootless daemon, or against a remote `DOCKER_HOST`.

So the default strategy starts a throwaway `alpine` container with the volume bind-mounted
**read-only**, runs `du`/`find`/`stat` inside the daemon's own namespace, parses the framed
log stream, and destroys the container. It needs no `sudo`, works on every topology, and
correctly measures payloads owned by foreign uids (a Postgres volume owned by uid 999
behind a `0700` directory measures fine).

The sidecar is locked down: no network, read-only rootfs, `CapDrop: ALL` plus only
`CAP_DAC_READ_SEARCH`, `no-new-privileges`, a memory cap and a pids cap. It runs as root
solely because unprivileged reads would silently under-report size. No caller-supplied
value is ever interpolated into the shell program — the target path arrives through the
environment, so a volume named `; rm -rf /` is inert data. The path is then re-resolved
with `cd -P` inside the container and re-checked against the mount root, which defeats a
symlink inside the volume pointing at the host filesystem.

Direct filesystem reads remain available as a fast path (`SCAN_ALLOW_HOST_FS`) and are used
automatically when the process really can read the mountpoint. Both live behind one
`ScanStrategy` interface; `GET /api/v1/health` reports which one this host resolved to, and
why.

### "Last used 48 days ago" is not a thing Docker knows

The Engine stores no last-used timestamp for a volume. `docker volume inspect` returns a
creation date and a mountpoint, and once the last referencing container is removed, the
daemon retains no evidence the relationship ever existed. Any tool that displays a
confident "last mounted 48 days ago" is inventing it.

Leviosa keeps its own **sighting ledger** instead: a background poll records which
containers are attached to which volumes, in SQLite. Idle time is therefore reported only
as far back as this tool has been watching, and every figure carries a
`trackingReliable` flag that stays false until the ledger is older than
`SIGHTING_TRUST_AFTER_DAYS`. Day one it says "tracking started recently" rather than
implying a volume has been dead for months.

The same store powers growth history, for the same reason: nothing else records what a
volume weighed yesterday.

## Requirements

- **Node.js ≥ 22.13** — `node:sqlite` is used as the embedded database, so there are no
  native modules to compile. It prints an experimental-feature warning on startup; that
  warning is expected.
- **Docker Engine** reachable over its socket, and permission to use it (membership of the
  `docker` group is enough — root is not required).

## Quick start

```bash
npm install

# Optional: both apps run on defaults without any .env file.
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

npm run dev
```

- Dashboard: <http://localhost:4200>
- API: <http://127.0.0.1:4300/api/v1/health>

`npm run dev` compiles the contracts first, then starts both apps in parallel. Run one side
alone with `npm run dev -w @leviosa/backend` or `npm run dev -w @leviosa/frontend`; each
compiles the contracts itself first.

Other scripts:

| Command             | Effect                                                     |
| ------------------- | ---------------------------------------------------------- |
| `npm run build`     | Compile contracts, bundle the API, build the UI            |
| `npm start`         | Run both production builds                                 |
| `npm run typecheck` | Typecheck all three workspaces                             |
| `npm run clean`     | Remove build output                                        |

## Configuration

Every variable is optional and documented inline in `backend/.env.example` and
`frontend/.env.example`. `process.env` is read in exactly one file per app
(`backend/src/config/env.config.ts`, `frontend/src/lib/config.ts`), validated with Zod, and
exposed as a frozen object — an unset or malformed variable fails at boot rather than
surfacing as `undefined` three layers deep.

The settings most worth knowing:

| Variable                    | Default              | Why you would change it                                        |
| --------------------------- | -------------------- | -------------------------------------------------------------- |
| `DOCKER_HOST`               | _(unset)_            | Point at a remote or rootless daemon instead of the socket      |
| `SCAN_TIMEOUT_MS`           | `300000`             | Raise it for multi-terabyte volumes that exceed the budget      |
| `SCAN_CONCURRENCY`          | `2`                  | Simultaneous scans; higher values contend for the same disk     |
| `SCAN_WITH_LAST_WRITE`      | `true`               | Disable to halve scan cost, losing the newest-mtime figure      |
| `SNAPSHOT_ENABLED` / `_CRON`| `true` / `15 3 * * *`| Periodic re-measurement; this is what fills growth history      |
| `ALLOW_VOLUME_DELETE`       | `true`               | Set `false` to run the API strictly read-only                   |

## API

All responses use one envelope, so a client never guesses:

```jsonc
{ "success": true,  "data": { }, "meta": { "page": { } } }
{ "success": false, "error": { "code": "VOLUME_IN_USE", "message": "…", "details": { } } }
```

| Method   | Route                            | Purpose                                            |
| -------- | -------------------------------- | -------------------------------------------------- |
| `GET`    | `/api/v1/health`                 | Daemon reachability and resolved scan strategy      |
| `GET`    | `/api/v1/system/summary`         | Counts, measured bytes, reclaimable bytes, queue    |
| `GET`    | `/api/v1/volumes`                | Collection; all filters are query parameters        |
| `GET`    | `/api/v1/volumes/:name`          | Full detail: usage, size, breakdown, growth, safety |
| `GET`    | `/api/v1/volumes/:name/entries`  | Depth-one listing of one directory (`?path=`)       |
| `GET`    | `/api/v1/volumes/:name/growth`   | Growth series (`?days=`)                            |
| `POST`   | `/api/v1/volumes/:name/scans`    | Queue a measurement; `202` with a job handle        |
| `GET`    | `/api/v1/jobs/:id`               | Poll a queued measurement                           |
| `DELETE` | `/api/v1/volumes/:name`          | Remove a volume (`?confirm=<name>`)                 |

Filtering, sorting and pagination are query parameters on the one collection endpoint —
`?usage=ORPHANED&sort=size&order=desc` — rather than separate `/orphaned` style routes.

Deletion passes three independent gates: the `ALLOW_VOLUME_DELETE` flag, a `confirm` token
that must equal the volume name, and a safety evaluation re-run immediately before the
call, because the container inventory can change between rendering a page and clicking a
button. A blocked attempt returns the specific containers responsible and is recorded in
the audit trail.

## Project layout

```
backend/src/
├── config/       Frozen config + every constant (no literals live in services)
├── docker/       dockerode client, container/volume repositories, sidecar runner
├── scanner/      Strategy interface, sidecar + host-fs strategies, probe script, parser
├── queue/        Bounded-concurrency queue and the scan job registry
├── store/        node:sqlite client, measurement/sighting/audit repositories
├── services/     Dependency graph, safety verdicts, assembly, browsing, summaries
├── validations/  Zod schemas at the edge
├── controllers/  Validate, delegate, envelope
├── routes/       Versioned router built from shared path segments
├── middlewares/  Request logging, error serialisation
└── scheduler/    Periodic snapshots and ledger polling

frontend/src/
├── app/          App Router pages, providers, design tokens
├── components/   ui/ primitives, volumes/ list, detail/ panels, layout/ shell
├── hooks/        One React Query hook per concern
└── lib/          API client, endpoint functions, query keys, config, constants
```

## Conventions

These are applied consistently; they are the difference between a codebase you can extend
and one you can only append to.

- **Wrapped modules.** Each module exports one frozen PascalCase object of named methods
  (`VolumeService`, `ScanParser`, `ApiResponse`). Internal helpers are prefixed with `_`
  and never exported.
- **Aggregator per directory.** `index.<dir>.ts` is the import surface; nothing reaches
  across into a sibling's internals.
- **No literals in logic.** Strings, numbers, table names, protocol tokens and enum values
  live in `config/constants.config.ts` or in `@leviosa/shared`.
- **Node built-ins are explicit.** `node:fs`, `node:path`, `node:crypto`, `node:sqlite`.
- **One error type.** Only `ApiError` is serialisable; anything else reaching the error
  middleware is logged in full and reported as `INTERNAL_ERROR` without leaking its
  message.
- **The main thread never blocks.** Measurement is delegated to the daemon and awaited
  through a bounded queue. Worker threads are deliberately absent: this process performs no
  CPU-bound work, so they would add machinery without moving a single cycle off the loop.

## Operational notes

- **Scans are asynchronous.** `POST /scans` returns `202` and a job id. A large volume is a
  full tree walk; an HTTP request is the wrong place to hold that open.
- **Duplicate scans collapse.** Requesting a scan for a volume already queued or running
  returns the existing job instead of piling on work.
- **Jobs are in-memory, measurements are durable.** A restart loses progress handles, never
  results. The `JOB_NOT_FOUND` message says so.
- **Stale sizes are shown, not hidden,** and labelled. A six-hour-old figure still answers
  "which of these is the big one?".
- **Unmeasured is not zero.** Volumes never scanned are counted separately so the
  reclaimable total is never quietly understated.
- **Sidecars are labelled and reaped.** Containers are tagged `io.leviosa.owner`; strays
  from a process that died mid-scan are cleaned up at boot.

## Deliberate limitations

- **Idle time starts when you install this.** Explained above: Docker keeps no history to
  backfill from.
- **Local `local`-driver volumes.** Third-party volume drivers (NFS, cloud) are listed and
  dependency-mapped, but their contents may not be walkable from a bind mount.
- **Bind mounts and images are out of scope.** Only named volumes. Extending to images and
  build cache is the natural next step, and the strategy interface is where it plugs in.
- **Single node, no auth.** This is a developer tool bound to `127.0.0.1` by default. It
  can delete data and has no authentication, so do not expose it on a shared network as-is.
- **Filenames containing newlines** produce one unparseable record in a listing, which the
  parser drops. Totals stay correct.
