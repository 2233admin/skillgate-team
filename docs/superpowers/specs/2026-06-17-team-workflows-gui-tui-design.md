# Team Workflows in Desktop GUI + TUI — Design Spec

**Date:** 2026-06-17  
**Status:** Approved  
**Repo:** `skillgate-team` (`D:\projects\_tools\skillgate-team`)

## Summary

Wire full team workflows (profile select, apply, doctor, lock verify, catalog drift) into **both** Electron Desktop and OpenTUI, using an in-process **`team-api`** library exported from the `skillgate` CLI package. Users should rarely need the terminal.

## Locked Decisions

| Topic | Choice |
|--------|--------|
| Scope | Desktop + TUI |
| Depth | Full: profile, apply, doctor, lock verify (incl. `--write`), catalog drift |
| Execution | In-process library from `cli`, not subprocess stdout parsing |
| Context | Default `SKILLGATE_ROOT`; optional **Linked project** reads `.skillgate/profile` |
| UI placement | Top-level **Team** tab; path config in **Settings** |
| Catalog drift UX | **B+C:** startup cached check (~6h) + Team tab badge + details on Team page |
| Architecture | **方案 1:** `cli/src/team-api/` + `package.json` exports; commands become thin wrappers |

## Architecture

```
Desktop Renderer → IPC → Main → team-api
TUI (Bun)        → direct import → team-api
CLI              → thin commands → team-api
team-api         → core (team-config, lock, profiles, installer)
```

### Persistence (SQLite settings, shared `~/.skillgate/skillgate.db`)

| Key | Purpose |
|-----|---------|
| `team.root` | Override team catalog root |
| `team.linkedProject` | Optional linked project path |
| `team.lastProfile` | Last selected profile in UI |

Drift throttle cache: `~/.skillgate/last-update-check` (existing).

## Team API Surface

Location: `cli/src/team-api/`

### Types

- `TeamContext`: `{ teamRoot, linkedProject, effectiveProfile, profileSource }`
- `Result<T>`: `{ ok: true, data: T } | { ok: false, error: { code, message, details? } }`
- Error codes: `TEAM_ROOT_MISSING`, `PROFILE_NOT_FOUND`, `NO_AGENTS`, `APPLY_PARTIAL_FAIL`, `LOCK_MISMATCH`, `NETWORK_TIMEOUT`, `UNKNOWN`

### Functions

| Function | Notes |
|----------|-------|
| `resolveTeamContext(input)` | Merge env, settings, linked project profile |
| `listProfiles(ctx)` | Profile names from `profiles/*.yaml` |
| `getProfileSummary(ctx, name)` | Metadata + skill count |
| `runApply(ctx, opts)` | No `process.exit`; returns install summary |
| `runDoctor(ctx, opts)` | Structured drifts (same kinds as CLI) |
| `runLockVerify(ctx, opts)` | `write` optional; returns mismatches |
| `checkCatalogDrift(ctx, opts)` | 6h throttle; `force` bypass |
| `getLastApplyState()` | Read `~/.skillgate/state.json` |

### `runApply` options (GUI defaults)

- `method`: `copy` on win32, else `symlink`
- `writeLock`: default `false`
- `dryRun`: optional plan-only mode

## Desktop (`/team`)

- Sidebar nav item **Team** with badge when `catalogDrift.status === 'behind'`
- On app ready: main process `checkCatalogDrift({ force: false })` (no modal)
- Page sections: drift banner, context card, profile picker, Apply / Doctor / Lock verify actions, last apply state
- Confirm dialogs for Apply and lock `--write`
- Settings: `team.root`, `team.linkedProject` (validate paths)

### IPC channels

- `team:getContext`, `team:listProfiles`, `team:apply`, `team:doctor`, `team:lockVerify`, `team:catalogDrift`

## TUI (`team` view)

- Tab: `Installed | Discover | Servers | Team` with `*` badge when behind
- Same capabilities as Desktop; shortcuts `a`/`d`/`l`, `r` refresh drift
- Settings: same `team.*` keys as Desktop

## Error & Safety

- Apply and lock `--write` require explicit confirmation
- Startup drift check is silent (badge only)
- Partial apply failures show per-skill errors

## Testing & DoD

1. Complete profile → apply → doctor → lock verify without terminal
2. Shared `team.*` settings keys across Desktop and TUI
3. Catalog `behind` shows consistent badge on both surfaces
4. CLI commands behave as before (regression tests pass)
5. New `team-api` unit tests for context, doctor, lock verify, drift throttle

## Out of Scope (v2)

- Cancel in-flight apply
- Separate `@skillgate/team-core` package extraction