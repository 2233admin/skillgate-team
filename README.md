# Skillgate Team

One repo for team skill distribution: **catalog** (skills, profiles, lock file) + **CLI** (`cli/`).

## Onboarding

```bash
# 1. Clone this repo (catalog lives at repo root)
git clone https://github.com/2233admin/skillgate-team.git ~/.skillgate-team

# 2. Install the skillgate CLI (from cli/)
cd ~/.skillgate-team/cli && npm install && npm run build
pwsh -NoProfile -File ../bin/skillgate-install.ps1   # Windows
# bash ../bin/skillgate-install.sh                    # Git Bash / macOS / Linux

# 3. Apply a profile
skillgate lock verify --write
skillgate apply --profile quant -y
skillgate doctor --profile quant
```

Override catalog path: `SKILLGATE_ROOT=/path/to/skillgate-team`

## Layout

```
skillgate-team/
├── skills/              # vendored team skills
├── profiles/            # e.g. quant.yaml
├── skills.lock.yaml     # pinned hashes
├── protect.yaml         # never overwrite (OMC, etc.)
├── VERSION
├── bin/                 # install, team-init, update-check
└── cli/                 # skillgate npm package (apply, doctor, …)
```

## Project binding

In an app repo:

```
.skillgate/profile     # e.g. quant
```

```powershell
pwsh -File path/to/skillgate-team/bin/skillgate-team-init.ps1 -Mode required
```

## Remote sync (optional)

```bash
export SKILLGATE_TEAM_REMOTE_REPO="https://github.com/2233admin/skillgate-team.git"
```

## Legacy repos

`team-skills` and `skillgate` were split during early scaffolding. **Use this repo going forward.**