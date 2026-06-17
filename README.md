# Skillgate Team

One repo for team skill distribution: **catalog** (skills, profiles, lock file) + **CLI** (`cli/`).

All onboarding runs through the **TypeScript CLI** (Node 18+) — macOS, Linux, and Windows.

## Onboarding

```bash
# 1. Clone this repo (catalog lives at repo root)
git clone https://github.com/2233admin/skillgate-team.git ~/.skillgate-team

# 2. Build and install the skillgate CLI globally
cd ~/.skillgate-team/cli && npm install && npm run build
node bin/skillgate.mjs install-global
# or after PATH refresh: skillgate install-global

# 3. Apply a profile
skillgate lock verify --write
skillgate apply --profile quant -y
skillgate doctor --profile quant

# 4. Post-merge verification (optional)
skillgate smoke-test
```

Override catalog path: `SKILLGATE_ROOT=/path/to/skillgate-team`

From repo root you can also run:

```bash
npm run install-global
npm run smoke-test
```

## Layout

```
skillgate-team/
├── skills/              # vendored team skills
├── profiles/            # e.g. quant.yaml
├── skills.lock.yaml     # pinned hashes
├── protect.yaml         # never overwrite (OMC, etc.)
├── VERSION
├── cli/                 # skillgate npm package (apply, doctor, install-global, …)
├── tui/                 # OpenTUI terminal UI (vendored from SkillsGate upstream)
├── desktop/             # Electron desktop GUI (vendored from SkillsGate upstream)
└── ui/                  # shared React components for desktop
```

## Terminal UI (TUI)

Upstream SkillsGate front-end experience in the terminal (Installed / Discover / SSH Servers / Settings).

```bash
# One-time: install TUI deps (requires Bun)
cd tui && bun install

# From anywhere (after cli build + install-global)
skillgate tui

# Or from repo root
npm run tui
```

Set `SKILLGATE_ROOT` to this repo so the TUI and CLI share the same team catalog. Local UI state is stored in `~/.skillgate/skillgate.db`.

## Desktop GUI

Upstream SkillsGate Electron app (Installed / Discover / SSH Servers / Settings / skill editor).

```bash
# One-time: install workspace deps (Electron binary + better-sqlite3 rebuild)
# Use Node 22–25 on Windows (Node 26 breaks native modules)
cd D:\projects\_tools\skillgate-team && npm run gui:install

# From anywhere (after cli build + install-global)
skillgate gui

# Or from repo root
npm run gui
npm run gui:window   # launch-gui.ps1 (picks Node 25 if installed)
```

Shares the same SQLite DB as the TUI (`~/.skillgate/skillgate.db`). Team profile/apply/doctor tabs are not wired yet.

If `skillgate gui` reports **Electron uninstall**, rerun `npm run gui:install` (forces
`electron/install.js` + `electron-rebuild` for `better-sqlite3`).

## Project binding

In an app repo:

```
.skillgate/profile     # e.g. quant
```

```bash
skillgate team-init --mode required
```

This writes `.skillgate/profile`, a portable `.claude/hooks/check-skillgate.sh`, and (when required) registers SessionStart in `.claude/settings.json`.

## Catalog updates (SessionStart hook)

`skillgate team-init --mode required` registers a SessionStart hook that runs `doctor -q` and `update-check` (24h throttle). Re-run `team-init` after upgrading the CLI to refresh the hook script.

```bash
skillgate update-check          # prints TEAM_CATALOG_UPGRADE when catalog drifted
skillgate update-check --force  # ignore 6h cache
```

When drift is detected, the hook prints `TEAM_CATALOG_UPGRADE <local> <remote>` to stderr.

## Remote sync (optional)

Two ways to detect catalog drift:

```bash
# Git commit hash (default in SessionStart hook if unset)
export SKILLGATE_TEAM_REMOTE_REPO="https://github.com/2233admin/skillgate-team.git"

# Or compare VERSION file via raw URL (not a .git remote)
export SKILLGATE_TEAM_REMOTE_URL="https://raw.githubusercontent.com/2233admin/skillgate-team/master/VERSION"
```

`SKILLGATE_TEAM_REMOTE_URL` takes precedence when set. Use a **raw** `VERSION` URL, not `https://github.com/...git`.

## Legacy repos

`team-skills` and `skillgate` were split during early scaffolding. **Use this repo going forward.**