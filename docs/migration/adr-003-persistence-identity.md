# ADR-003: Preserve application/data identity and enforce one writer

Status: **Accepted**
Date: 2026-07-13

## Context

The Electron package currently identifies the application as:

- product name: `Skillgate`
- bundle/application ID: `ai.skillgate.desktop`
- persisted database: `~/.skillgate/skillgate.db`

The SQLite database contains settings, remote servers and skills, cached skills,
favorites and trending cache. The Electron desktop uses `better-sqlite3`; the TUI
uses `bun:sqlite` against the same path. The CLI also owns file state beneath
`~/.skillgate` and project `.skillgate/` directories.

Changing the bundle ID or data root during the Tauri migration would produce a
fresh application identity, orphan settings, break update continuity, and hide
migration failures. Allowing Electron, Tauri and TUI to mutate one database at
the same time makes schema and rollback ownership ambiguous even when SQLite WAL
can technically arbitrate writes.

## Decision

The Tauri application preserves the existing identity:

- `productName = "Skillgate"`
- Tauri identifier/bundle ID = `ai.skillgate.desktop`
- canonical user state root = `~/.skillgate`
- canonical database = `~/.skillgate/skillgate.db`
- canonical Team repository default remains `~/.skillgate-team`
- project binding remains `<project>/.skillgate/`

Platform-specific installer metadata may differ, but it must resolve to this
logical identity. No Tauri/Pake default data directory becomes a second source
of truth. OS credential stores may hold secrets; the database stores references,
never copied private-key or credential contents.

The target persistence authority is the Rust host. It owns database open,
migration, transactions, backup, recovery, settings, favorites, caches and
remote metadata. Renderer and Team sidecar never open SQLite directly.

## Single-writer invariant

At most one process may hold the read-write lease for
`~/.skillgate/skillgate.db`.

- The lease is an OS-backed exclusive lock with owner metadata in
  `~/.skillgate/skillgate.db.writer` (product, PID, process start identity,
  version, mode and acquisition time). Metadata is diagnostic; the OS lock is
  authoritative.
- Tauri must acquire the lease before schema inspection or migration and retain
  it for its lifetime. Failure returns `WRITER_BUSY` and opens no writable
  connection.
- Electron differential runs are read-only. An explicitly selected legacy
  rollback may acquire the writer lease only after Tauri exits.
- TUI must acquire the same lease before opening a read-write database. If Tauri
  owns it, TUI runs read-only where the requested screen supports that mode or
  exits the mutation with a clear `WRITER_BUSY` result.
- CLI and Team sidecar do not write this SQLite database. Their existing file
  state writes remain atomic and must use a scoped lock when they can conflict
  with Team mutations.
- A process never removes another live owner's lock. Stale metadata may be
  replaced only after the OS proves that no exclusive lock is held.

This is a product invariant, not merely a migration convenience.

## Migration and first-run cutover

The first Tauri writable start performs these steps while holding the lease:

1. Resolve the canonical path and reject symlink/redirection surprises.
2. Record file identity, size and hash; run SQLite integrity and foreign-key
   checks without modifying the source.
3. Create a timestamped backup in `~/.skillgate/backups/` using SQLite's online
   backup mechanism and fsync the backup and directory.
4. Copy to a staging database, run ordered idempotent Rust migrations in one
   transaction where SQLite permits, and validate schema plus row-count/domain
   invariants for every table.
5. Atomically replace the canonical database and write a migration receipt with
   source/target schema versions, hashes, app build and correlation ID.
6. Reopen the canonical database, rerun integrity checks, then enable AppAPI
   mutation capabilities.

If validation fails, the staged target is quarantined, the canonical source is
left/restored byte-for-byte, and the application starts without write
capabilities. Migration is never inferred complete from file existence alone.

Current schema versions and compatibility column patches are inputs to the Rust
migration tests. Rust may not silently renumber or reinterpret existing
`schema_version` rows.

## Data classification and ownership

| Data | Authority | Notes |
| --- | --- | --- |
| Settings, favorites, remote metadata | Rust persistence service | durable SQLite rows |
| Installed skills/rules/agents/context | filesystem | database rows are rebuildable cache |
| Cached skills and trending results | Rust persistence service | disposable, versioned cache |
| Team profile/catalog/lock | `team-api` + Team repository files | not copied into SQLite as authority |
| Last Team apply state | existing Team file-state contract | AppAPI exposes it through sidecar |
| SSH credentials/private keys | OS/user-owned storage | database stores path/reference only |
| Terminal sessions/output | Rust process manager | ephemeral; not persisted by default |

Every durable row type has exactly one write owner. DTO consumers may request a
mutation through AppAPI but never obtain a raw database handle.

## Rollback

Rollback is whole-runtime, never table-by-table dual operation:

- close Tauri and release the writer lease;
- verify the pre-migration backup and restore it atomically if the Tauri schema
  is not backward compatible;
- start the pinned Electron build as the sole writer;
- record the rollback receipt and preserve the failed database for diagnosis.

Electron and Tauri must never be presented as simultaneous writable choices.
After a release declares its migration irreversible, the updater must prevent
downgrade to a build that cannot read the current schema unless an explicit
backup restore workflow is used.

## Consequences

Positive:

- Existing installs retain settings, update identity and local data.
- Migration and rollback have one accountable writer.
- Rust becomes a narrow, auditable persistence boundary.
- Renderer compromise cannot directly open or alter the database.

Costs:

- TUI mutation behavior must cooperate with the writer lease.
- First writable launch needs backup space and may take longer.
- Rust migrations and legacy-schema fixtures must be maintained.

## Rejected alternatives

- **Use Tauri's default app-data directory:** rejected because it forks identity
  and requires an avoidable import/synchronization layer.
- **Create a new database and best-effort copy settings:** rejected because it
  loses provenance, rollback integrity and cache/remote state guarantees.
- **Let SQLite WAL handle all processes:** rejected because WAL does not assign
  schema-migration or rollback ownership.
- **Keep `better-sqlite3` as a writable sidecar:** rejected because it preserves
  the Node native-module packaging and dual-writer risks being removed.

## Verification gates

- Bundle identifier and canonical data paths are asserted on Windows, macOS and
  Linux packages.
- Legacy schema fixtures for every supported version migrate with integrity,
  row-count and semantic assertions.
- Forced crash tests cover backup, staged migration, atomic replacement and
  reopen boundaries.
- Two-process tests prove that Tauri/Electron/TUI cannot hold concurrent writer
  leases and that a live lock is never stolen.
- Rollback restores a verified pre-migration database and the legacy application
  reads it successfully.
