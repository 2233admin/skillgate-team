# Upstream fork baseline

Forked from [skillsgate/skillsgate](https://github.com/skillsgate/skillsgate) `packages/cli`.

Local review clone: `C:\Users\Administrator\.cache\skillsgate-review`

## What we kept

- `installer.ts` — canonical install + symlink/junction/copy
- `agents.ts` — multi-agent path registry (+ `grok`)
- `skill-discovery.ts`, `git.ts`, `add/remove/list` commands

## What we added

- `team-config.ts`, `team-lock.ts`, `profiles.ts`, `protect.ts`, `content-hash.ts`
- Commands: `apply`, `doctor`, `setup --team`, `lock verify`
- Package rename: `skillgate` v0.1.0

## TUI (vendored from upstream)

- `tui/` — OpenTUI terminal UI from `packages/tui` (SkillsGate upstream)
- Launch: `skillgate tui` (Bun + source) or `cd tui && bun run start`
- Requires [Bun](https://bun.sh) for dev/source mode; optional `@skillsgate/tui-win32-x64` binary fallback
- SQLite state: `~/.skillgate/skillgate.db`
- Team tabs (profiles / lock / doctor) — not yet wired; TUI still uses upstream Installed / Discover / Servers flow

## What we de-emphasized

- SkillsGate cloud login/publish as primary workflow (team uses lock + profiles)

## Global install (team)

`npm link -g` fails on npm v11+ (`ELINKGLOBAL`). Use:

```bash
cd path/to/skillgate-team/cli
npm run build && npm run install-global
# or: node bin/skillgate.mjs install-global
```

Installs junction `~/.skillgate/repo` → source tree, shims in `~/.skillgate/bin`, sets User `PATH`, `SKILLGATE_HOME`, `SKILLGATE_CLI`.