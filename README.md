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
└── cli/                 # skillgate npm package (apply, doctor, install-global, …)
```

## Project binding

In an app repo:

```
.skillgate/profile     # e.g. quant
```

```bash
skillgate team-init --mode required
```

This writes `.skillgate/profile`, a portable `.claude/hooks/check-skillgate.sh`, and (when required) registers SessionStart in `.claude/settings.json`.

## Catalog updates (optional hook)

```bash
skillgate update-check          # prints TEAM_CATALOG_UPGRADE when VERSION drifted
skillgate update-check --force  # ignore 24h cache
```

## Remote sync (optional)

```bash
export SKILLGATE_TEAM_REMOTE_REPO="https://github.com/2233admin/skillgate-team.git"
```

## Legacy repos

`team-skills` and `skillgate` were split during early scaffolding. **Use this repo going forward.**