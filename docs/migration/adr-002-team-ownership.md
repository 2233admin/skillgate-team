# ADR-002: Team workflows remain owned by `team-api`

Status: **Accepted**
Date: 2026-07-13

## Context

Skillgate currently implements Team context resolution, profiles, apply, doctor,
lock verification, catalog drift and last-apply state in
`cli/src/team-api/`. CLI commands and the TUI call that library directly. The
Electron main process registers `team:*` IPC handlers that translate desktop
settings and delegate to the same functions.

Replacing Electron with Tauri creates a language boundary. Reimplementing Team
rules in Rust would create two authorities for profile precedence, lock hashes,
installation behavior, drift detection and error codes. A full Rust rewrite is
not required to gain a Rust desktop shell and would make parity unprovable.

## Decision

`cli/src/team-api/` remains the canonical implementation and domain authority.
The Tauri host calls it through a bundled, versioned **Team sidecar**. Rust owns
sidecar lifecycle, transport, cancellation, access policy and AppAPI mapping; it
does not reproduce Team business rules.

CLI and TUI may continue importing `team-api` directly. All surfaces must execute
the same released Team API version and parity fixtures.

## Sidecar contract

The sidecar is built from the repository's pinned `team-api` source and packaged
with the desktop application. It is not downloaded at runtime and does not load
arbitrary project JavaScript.

- Protocol: UTF-8 JSON Lines over private stdin/stdout.
- stdout is protocol-only; structured diagnostics go to stderr.
- First exchange is `hello`, containing sidecar semantic version, Team protocol
  major/minor, build commit, supported methods and schema digest.
- Tauri fails closed with `SIDECAR_UNAVAILABLE` or `UNSUPPORTED_VERSION` when
  executable identity, protocol major, schema digest, or required method set is
  incompatible.
- Requests contain AppAPI request/correlation IDs, deadline and a tagged Team
  method payload. Responses use the AppAPI result/error envelope.
- Supported v1 methods are `getContext`, `listProfiles`, `getProfileSummary`,
  `apply`, `doctor`, `lockVerify`, `catalogDrift`, and `getLastApplyState`.
- Sidecar environment is allowlisted. Team root, linked project, profile and
  state directory are explicit inputs; inherited secrets and PATH are minimized.
- One long-lived sidecar is owned by one desktop instance. It is terminated with
  the application and restarted with bounded backoff after an unexpected exit.

Mutating Team calls are serialized. `apply` and `lockVerify(write=true)` require
AppAPI idempotency keys and acquire the relevant filesystem/persistence writer
lease. Read-only calls may execute concurrently against a stable snapshot.
Cancellation is cooperative; the sidecar reports whether a mutation crossed its
commit point.

Two current desktop Team operations remain host-owned adapters rather than
sidecar domain methods: `getDriftState` returns the host's last versioned drift
event snapshot, and `setLastProfile` writes the `team.lastProfile` preference
through the Rust persistence service. Their AppAPI signatures and results are
still mandatory and are defined in `app-api-v1.md`; the host passes that setting
back into `resolveTeamContext` on subsequent sidecar calls.

## Type and error ownership

`team-api` owns Team domain DTOs and stable codes currently declared in
`cli/src/team-api/types.ts`. AppAPI owns the outer transport envelope. The host
performs a mechanical mapping; it must not reinterpret successful data, collapse
`APPLY_PARTIAL_FAIL`, or infer status from message text.

Changes follow this sequence:

1. change Team domain types and behavior with `team-api` tests;
2. bump the Team protocol version and fixtures;
3. update sidecar serialization and AppAPI mapping;
4. run the same fixture corpus through CLI, direct library, sidecar and desktop.

## Consequences

Positive:

- CLI, TUI and desktop retain one behavioral implementation.
- The Tauri migration is an adapter change, not a Team rewrite.
- Differential tests can compare structured results using identical fixtures.
- Rust remains the authority for privileged desktop operations.

Costs:

- Desktop packaging includes a sidecar runtime artifact.
- Lifecycle, protocol compatibility and cancellation need explicit tests.
- Cross-boundary calls have serialization overhead; Team operations are coarse
  enough that this is not performance-critical.

## Rejected alternatives

- **Port Team workflows to Rust now:** rejected because it creates dual logic
  during the highest-risk migration phase.
- **Run the CLI and parse terminal text:** rejected because output is not a
  stable protocol and loses typed partial-failure details.
- **Expose a local HTTP server:** rejected because it adds port discovery,
  authentication and firewall surface without a remote-client requirement.
- **Keep Electron solely for Team IPC:** rejected because it prevents removal of
  the Electron runtime and leaves two desktop privilege hosts.

## Guardrails and exit criteria

- No Team policy or lock-hash implementation is added to Rust.
- The sidecar cannot mutate the SQLite database directly; persistence goes
  through the single-writer policy in ADR-003.
- Protocol and executable identity are verified before the first Team call.
- Electron may be retained only as a read-only differential oracle during
  migration; it must not write concurrently with Tauri.
- ADR replacement requires measured evidence that another implementation passes
  all Team parity, compatibility and migration fixtures.
