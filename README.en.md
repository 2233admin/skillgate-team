<div align="center">

<img src="docs/images/logo.svg" width="72" height="72" alt="Skillgate logo" />

# Skillgate Team

<p>
  <a href="README.md">Home</a> · <a href="README.zh-CN.md">简体中文</a> · <strong>English</strong>
</p>

**Git-backed team skill catalog. One repo — aligned installs on Codex CLI and every agent.**

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](VERSION)
[![Node](https://img.shields.io/badge/node-22--25-339933?logo=node.js&logoColor=white)](package.json)
[![Bun](https://img.shields.io/badge/bun-1.3.14-black?logo=bun&logoColor=white)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](cli/package.json)
[![Tests](https://img.shields.io/badge/tests-56%20passing-brightgreen)](#development)

[Install](#install) · [What it does](#what-it-does) · [UI](#what-it-looks-like) · [Getting started](docs/GETTING_STARTED.en.md) · [Issues](https://github.com/2233admin/skillgate-team/issues/new/choose)

</div>

Every machine drifts: `~/.codex/skills` on one laptop, three extra skills on another, stale copies on a third. Onboarding becomes guesswork.

Skillgate Team is the **single Git catalog** for your squad. Maintainers edit `profiles/`; everyone `git pull` and **Apply**. **Codex CLI**, Claude Code, Cursor, and Grok receive the same pinned skill set — no more channel pings about who forgot to sync.

---

## Install

```bash
git clone https://github.com/2233admin/skillgate-team.git ~/.skillgate-team
cd ~/.skillgate-team

bun install --ignore-scripts
bun run build
bun run install-global
```

Desktop on Windows: `bun run gui:install`  
Runtime: **Bun** + **Node 22–25** (Node 26 breaks SQLite).

Apply the default profile:

```bash
skillgate apply --profile quant -y
skillgate doctor --profile quant
```

Codex CLI target: `~/.codex/skills` (or `$CODEX_HOME/skills`).

---

## What it does

<p align="center">
  <img src="docs/images/architecture.svg" alt="Team catalog → Skillgate → local agents" width="920" />
</p>

#### Team catalog — source of truth

`skills/` holds vendored skills; `profiles/` declares what to install; `skills.lock.yaml` pins content hashes. Silent edits surface in Doctor and lock verify.

#### Profile — one YAML for the team

Default [`quant`](profiles/quant.yaml): **12 skills** shipped to **Codex CLI, Claude Code, Cursor, and Grok**. Day-to-day users pick a profile and Apply; maintainers own the YAML.

#### Apply · Doctor · Lock — sync and audit

- **Apply** — symlink skills per profile; entries in [`protect.yaml`](protect.yaml) are never overwritten
- **Doctor** — compare local installs vs profile; list missing and drifted items
- **Lock verify** — disk content vs lock hashes; maintainers use `--write` then commit
- **Catalog drift** — when remote `VERSION` moves ahead, Desktop / TUI show a pull reminder

#### Desktop · TUI · CLI — one `team-api`

`skillgate gui` · `skillgate tui` (press `4` for Team) · `skillgate apply --profile quant -y`  
All surfaces call `cli/src/team-api/` — no GUI-only behavior.

#### team-init — bind a product repo

`skillgate team-init --mode required` writes `.skillgate/profile`; Desktop **Linked project** can read it automatically.

### Default profile `quant` — skill index

Quant / full-stack engineering. 12 skills × 4 agents. Source: [`profiles/quant.yaml`](profiles/quant.yaml).

#### coding-standards — baseline quality

Naming, readability, immutability; framework specifics live in frontend / backend skills.

#### frontend-patterns — React / Next

State, performance, component structure for everyday UI work.

#### nextjs-turbopack — Next.js 16+ and Turbopack

Incremental bundling, dev speed, when to prefer Turbopack over webpack.

#### backend-patterns — server architecture

Layering and pitfalls for Node, Express, and Next API routes.

#### api-design — REST APIs

Resources, status codes, pagination, errors, versioning, rate limits.

#### security-review — security checklist

Auth, input, secrets, payments — triggered on sensitive paths.

#### tdd-workflow — test-driven development

Features, fixes, refactors: tests first, 80%+ coverage target.

#### e2e-testing — Playwright E2E

Page objects, CI, artifacts, flaky-test handling.

#### verification-loop — session verification

Stage large tasks with explicit verify steps.

#### documentation-lookup — live library docs

Context7 MCP instead of stale training-data APIs.

#### deep-research — multi-source research

Search, cross-check, cite sources.

#### strategic-compact — manual context compaction

Compact at logical breakpoints, not mid-task truncation.

---

## What it looks like

> Illustrations match production layout. Real screenshots: [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md).

<table>
<tr>
<td width="58%">

**Desktop**

Set **Team catalog root** → choose profile → Apply → Doctor.

<p align="center">
  <img src="docs/images/desktop-team-preview.svg" alt="Desktop Team screen" width="100%" />
</p>

</td>
<td width="42%">

**TUI**

`skillgate tui` → `4` → `a` apply → `d` doctor.

<p align="center">
  <img src="docs/images/tui-team-preview.svg" alt="TUI Team screen" width="100%" />
</p>

</td>
</tr>
</table>

Desktop UI supports **English** and **简体中文** (Settings → Language).

---

## First run

1. `skillgate gui` or `skillgate tui`
2. **Settings** → **Team catalog root** = your clone path
3. **Team** → `quant` → **Apply** → **Doctor**

Smoke check: `bun run smoke-team` (15 checks). Full paths: [docs/GETTING_STARTED.en.md](docs/GETTING_STARTED.en.md).

---

## FAQ

**“Catalog unavailable” on Team?**  
Wrong or missing **Team catalog root**, or set `SKILLGATE_ROOT` to the clone.

**Desktop won’t start?**  
Use Node 22–25 and run `bun run gui:install` from the repo root.

**Maintainer shipped skill updates?**  
`git pull` → **Apply**; maintainers run `skillgate lock verify --write` and commit the lock.

---

## Repository map

| Path | Contents |
|------|----------|
| [`skills/`](skills/) | Vendored team skills |
| [`profiles/`](profiles/) | Profile definitions |
| [`skills.lock.yaml`](skills.lock.yaml) | Content hash lock |
| [`cli/`](cli/) | `skillgate` CLI + `team-api` |
| [`desktop/`](desktop/) | Electron app (en / zh-CN UI) |
| [`tui/`](tui/) | OpenTUI terminal UI |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Visual system |
| [`docs/images/`](docs/images/) | README assets |

---

## Development

```bash
bun install --ignore-scripts
bun run test
bun run build
bun run graph
```

Before PRs: [CONTRIBUTING.md](CONTRIBUTING.md).