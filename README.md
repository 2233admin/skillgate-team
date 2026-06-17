<div align="center">

<img src="docs/images/logo.svg" width="72" height="72" alt="Skillgate logo" />

# Skillgate Team

**把团队的 Agent Skills 收进一个 Git 仓库，像锁依赖版本一样锁技能清单。**

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](VERSION)
[![Node](https://img.shields.io/badge/node-22--25-339933?logo=node.js&logoColor=white)](package.json)
[![Bun](https://img.shields.io/badge/bun-1.3.14-black?logo=bun&logoColor=white)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](cli/package.json)
[![Tests](https://img.shields.io/badge/tests-56%20passing-brightgreen)](#开发)

[快速开始](#快速开始) · [界面长什么样](#界面长什么样) · [入门指南](docs/GETTING_STARTED.md) · [提 Issue](https://github.com/2233admin/skillgate-team/issues/new/choose) · [English](#english)

</div>

---

## 这篇 README 在说什么

你肯定见过这种场面：有人本地多装了三个 skill，有人还在用上周的版本，新人入职要问三遍「到底装哪些、装到哪」。口头同步撑不了多久。

Skillgate Team 的做法很直接——**团队目录就是一个 Git 仓库**。技能文件在 `skills/`，装什么由 `profiles/` 里的 YAML 说了算，改了什么用 `skills.lock.yaml` 钉死哈希。成员 `git pull` 之后 Apply 一下，本机的 Claude / Codex / Cursor / Grok 就跟目录对齐了。

不想记命令就开 Desktop 或 TUI；要接 CI 就走 CLI。三端走同一套 `team-api`，不会出现「GUI 能装、命令行不行」这种分裂。

---

## 谁适合用

- **小队维护者**：改 profile、更 lock、发 PR，成员跟着 pull + Apply。
- **日常写代码的人**：选好 `quant`（或你们自己的 profile），点 Apply，然后忘掉这件事。
- **接自动化的同学**：`skillgate apply` / `doctor` / `lock verify` 可以塞进脚本或流水线。

默认带的 [`quant`](profiles/quant.yaml) profile：12 个技能，覆盖 Claude Code、Codex CLI、Cursor、Grok 四个 Agent。

---

## 怎么运作

<p align="center">
  <img src="docs/images/architecture.svg" alt="团队目录 → Skillgate → 本机 Agent" width="920" />
</p>

```
skillgate-team/          profiles/quant.yaml        ~/.claude/skills/
├── skills/      ──►    skillgate apply    ──►    ~/.codex/skills/
├── profiles/            doctor / lock              ~/.cursor/skills/
└── skills.lock.yaml     (CLI · TUI · Desktop)      ~/.grok/skills/
```

| 动作 | 干什么 |
|------|--------|
| **Apply** | 按 profile 把技能链到本机；[`protect.yaml`](protect.yaml) 里标了保护的，不会误覆盖 |
| **Doctor** | 对一下「本机已装」和 profile，缺了啥、漂了啥，列清楚 |
| **Lock verify** | 磁盘上的技能和 `skills.lock.yaml` 哈希是否一致；维护者用 `--write` 更新 lock |
| **Catalog drift** | 远程 `VERSION` 比本地新时，Desktop / TUI 顶部会挂横幅提醒你 pull |
| **team-init** | 在业务仓库写 `.skillgate/profile`，可选挂上 SessionStart 检查 |

---

## 界面长什么样

> 示意图，布局和真实 Desktop / TUI 一致。想换成实拍见 [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md)。

<table>
<tr>
<td width="58%">

**Desktop** — 不想记命令时用这个

设好 **Team catalog root**，选 profile，Apply，再跑一遍 Doctor 自检。

<p align="center">
  <img src="docs/images/desktop-team-preview.svg" alt="Desktop Team 页示意" width="100%" />
</p>

</td>
<td width="42%">

**TUI** — 终端里待着的人

`skillgate tui`，按 `4` 进 Team，`a` 应用，`d` 自检。

<p align="center">
  <img src="docs/images/tui-team-preview.svg" alt="TUI Team 页示意" width="100%" />
</p>

</td>
</tr>
</table>

| 入口 | 命令 |
|------|------|
| Desktop | `skillgate gui` |
| TUI | `skillgate tui` |
| CLI | `skillgate apply --profile quant -y` |

---

## 快速开始

### 1. 克隆团队目录

```bash
git clone https://github.com/2233admin/skillgate-team.git ~/.skillgate-team
cd ~/.skillgate-team
```

Windows 可以放在 `D:\skillgate-team`，路径别带中文空格，后面要在设置里原样填进去。

### 2. 安装

需要 [Bun](https://bun.sh) 和 **Node 22–25**。Node 26 会把 SQLite 原生模块搞崩，别踩这个坑。

```bash
bun install --ignore-scripts
bun run build
bun run install-global
```

Windows 要用桌面版的话，再多跑一步：

```powershell
bun run gui:install
```

### 3. 应用 profile

命令行：

```bash
skillgate apply --profile quant -y
skillgate doctor --profile quant
```

图形界面：`skillgate gui` 或 `skillgate tui` → **设置**里填 **Team catalog root** → **Team** → 选 `quant` → **Apply** → **Doctor**。

装完可以跑 `bun run smoke-team` 做 15 项自检。更细的步骤在 [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)。

---

## 绑到你的业务仓库

```bash
cd your-app
skillgate team-init --mode required
```

会在项目里生成 `.skillgate/profile`，并挂上 Claude Code 的 SessionStart 检查。Desktop / TUI 里填 **Linked project** 也能自动读这个 profile。

---

## 常见问题

<details>
<summary><strong>Team 页说「目录不可用」</strong></summary>

多半是 **Team catalog root** 没填对，或者填了个不存在的路径。去 **设置** 里改成你 `git clone` 下来的目录；也可以设环境变量 `SKILLGATE_ROOT` 指向同一个地方。
</details>

<details>
<summary><strong>Desktop 起不来，报 Electron / SQLite</strong></summary>

先确认 Node 版本在 22–25，然后在仓库根目录执行 `bun run gui:install` 重装原生依赖。
</details>

<details>
<summary><strong>维护者更新了技能，我怎么跟？</strong></summary>

在团队目录 `git pull`，打开 Team 页点 **Apply**（或 `skillgate apply -y`）。维护者改完技能内容后，记得 `skillgate lock verify --write` 更新 lock 并提交，这样大家 Doctor 时对得上。
</details>

---

## 仓库地图

| 路径 | 内容 |
|------|------|
| [`skills/`](skills/) | 团队 vendored 技能 |
| [`profiles/`](profiles/) | Profile 定义 |
| [`skills.lock.yaml`](skills.lock.yaml) | 内容哈希锁定 |
| [`cli/`](cli/) | `skillgate` CLI + `team-api` |
| [`desktop/`](desktop/) | Electron 桌面应用 |
| [`tui/`](tui/) | OpenTUI 终端 UI |
| [`docs/images/`](docs/images/) | README 配图 |

---

## 开发

```bash
bun install --ignore-scripts
bun run test      # 56 tests (cli + desktop)
bun run build
bun run graph     # Nx 依赖图
```

想提 PR 先看 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## English

Skillgate Team keeps your squad’s agent skills in one git repo. Profiles declare what to install and where; `skills.lock.yaml` pins content hashes; Apply / Doctor / drift checks keep everyone’s machine aligned across Claude Code, Codex, Cursor, and Grok — via CLI, TUI, or Desktop.

- [GETTING_STARTED.md](docs/GETTING_STARTED.md)
- [Open an issue](https://github.com/2233admin/skillgate-team/issues/new/choose)

---

<div align="center">

<sub>旧仓库 <code>team-skills</code>、<code>skillgate</code> 已弃用，请用本仓库。</sub>

</div>