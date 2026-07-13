# Getting started

<p>
  <a href="GETTING_STARTED.md">简体中文</a> · <strong>English</strong>
</p>

Use with [README.en.md](../README.en.md).

<p align="center">
  <img src="images/architecture.svg" alt="Architecture" width="720" />
</p>

---

## Easy install (start here)

| Step | Action |
|------|--------|
| 0 | Install [Bun](https://bun.sh) + [Git](https://git-scm.com/downloads) (desktop source development also needs [Node 22](https://nodejs.org) and [Rust](https://rustup.rs)) |
| 1 | Clone to `~/.skillgate-team` |
| 2 | Run **`bun run bootstrap`** (`bootstrap:desktop` on Windows for GUI) |
| 3 | **New terminal** → `skillgate doctor --profile quant` |
| 4 | Optional GUI → `skillgate gui`, set **Team catalog root** to the clone path |

One-liner:

```bash
git clone https://github.com/2233admin/skillgate-team.git ~/.skillgate-team && cd ~/.skillgate-team && bun run bootstrap
```

Prefer an installer? Download the Windows, macOS, or Linux package from [GitHub Releases](https://github.com/2233admin/skillgate-team/releases). Then bind the team catalog in Settings.

---

## Five terms

- **Team catalog** — this repo (`skills/`, `profiles/`, `skills.lock.yaml`)
- **Profile** — YAML listing skills and target agents; default `quant`
- **Apply** — link skills into `~/.codex/skills`, `~/.claude/skills`, etc.
- **Doctor** — diff local installs vs profile
- **Lock** — hashes in `skills.lock.yaml`; silent edits fail verify

Daily workflow: **pick profile → Apply**. Maintainers own YAML and lock.

---

## Path A — Desktop

### Prerequisites

[Bun](https://bun.sh) + **Node 22 or newer** + [Rust 1.85 or newer](https://rustup.rs). Clone to a stable path:

- macOS / Linux: `~/.skillgate-team`
- Windows: `D:\skillgate-team` (avoid spaces and non-ASCII paths)

### Install

```powershell
bun install --ignore-scripts
bun run build
bun run gui:install
bun run install-global
```

```bash
# macOS / Linux — see README for desktop deps
bun install --ignore-scripts
bun run build
bun run install-global
```

### In the app

```bash
skillgate gui
```

1. **Settings** → **Team catalog root** = clone path  
2. (Optional) **Linked project** = product repo  
3. **Team** → `quant` → **Apply** → **Doctor**  
4. UI language: **Settings** → **Language** (English / 简体中文)

Yellow drift banner → `git pull`, then Apply again.

---

## Path B — TUI

```bash
skillgate tui
```

| Key | Action |
|-----|--------|
| `4` | Team |
| `j` / `k` | Select profile |
| `a` | Apply |
| `d` | Doctor |
| `l` | Verify lock |
| `r` | Refresh drift |
| `s` | Set team.root |
| `?` | Shortcuts |

“Catalog unavailable” → press `s`, set **team.root**.

---

## Path C — CLI only

```bash
export SKILLGATE_ROOT=~/.skillgate-team

skillgate apply --profile quant -y
skillgate doctor --profile quant
skillgate lock verify
skillgate smoke-test
```

Bind a product repo:

```bash
cd ~/projects/my-app
skillgate team-init --mode required
```

---

## `quant` profile

**12 skills** × **4 agents** (**codex-cli**, claude-code, cursor, grok).

Skill index: [README.en.md](../README.en.md#default-profile-quant--skill-index). YAML: [profiles/quant.yaml](../profiles/quant.yaml).

Maintainers: edit `profiles/*.yaml` → `skillgate lock verify --write` → commit → members `git pull` + Apply.

---

## When the catalog is behind

1. `git pull`
2. Check local vs remote version on Team screen
3. **Apply** again
4. Maintainers commit updated lock

`team-init --mode required` can surface `TEAM_CATALOG_UPGRADE` on Claude Code session start.

---

## Verify install

```bash
bun run smoke-team
```

Expect 15 passing checks.

---

## Stuck?

[Help request template](https://github.com/2233admin/skillgate-team/issues/new?template=help_request.yml) — include OS, Node/Bun, CLI/TUI/Desktop, **Team catalog root**, full error text.
