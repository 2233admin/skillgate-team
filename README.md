<div align="center">

<img src="docs/images/logo.svg" width="72" height="72" alt="Skillgate logo" />

# Skillgate Team

**团队 AI 技能目录 — 像管 npm 包一样管 Agent Skills**

一条 Git 仓库锁定技能清单；成员用桌面 / 终端 / 命令行一键 **Apply**，全员环境一致。

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](VERSION)
[![Node](https://img.shields.io/badge/node-22--25-339933?logo=node.js&logoColor=white)](package.json)
[![Bun](https://img.shields.io/badge/bun-1.3.14-black?logo=bun&logoColor=white)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](cli/package.json)
[![Tests](https://img.shields.io/badge/tests-56%20passing-brightgreen)](#开发)

[快速开始](#-快速开始-3-步) · [界面预览](#-界面预览) · [入门指南](docs/GETTING_STARTED.md) · [提 Issue](https://github.com/2233admin/skillgate-team/issues/new/choose) · [English](#english-summary)

</div>

**目录：** [一句话说明](#一句话说明) · [架构](#架构一览) · [界面预览](#界面预览) · [核心能力](#核心能力) · [快速开始](#快速开始-3-步) · [FAQ](#常见问题) · [开发](#开发)

---

## 一句话说明

| 传统做法 | Skillgate Team |
|----------|----------------|
| 技能散在各人电脑，版本对不上 | **一个仓库** 存 `skills/` + `profiles/` + `skills.lock.yaml` |
| 新人不知道装哪些、装到哪 | **Profile**（如 `quant`）声明装什么、给哪些 Agent |
| 更新靠口头喊「pull 一下」 | **Apply / Doctor / 漂移检测**，落后了界面会提醒 |

> **English:** One git repo is the source of truth for team skills. Pick a profile, apply to Claude / Codex / Cursor / Grok — CLI, TUI, or Desktop.

---

## 架构一览

<p align="center">
  <img src="docs/images/architecture.svg" alt="Skillgate Team 架构：团队目录 → Skillgate → 本机 Agent" width="920" />
</p>

```
skillgate-team/          profiles/quant.yaml        ~/.claude/skills/
├── skills/      ──►    skillgate apply    ──►    ~/.codex/skills/
├── profiles/            doctor / lock              ~/.cursor/skills/
└── skills.lock.yaml     (CLI · TUI · Desktop)      ~/.grok/skills/
```

---

## 界面预览

> 以下为 **界面示意图**（与真实 Desktop / TUI 布局一致）。维护者可用 `skillgate gui` 截屏替换为实拍，见 [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md)。

<table>
<tr>
<td width="58%">

**Desktop — Team 工作流（推荐新手）**

设置好目录根路径后：选 profile → 应用 → Doctor 自检。

<p align="center">
  <img src="docs/images/desktop-team-preview.svg" alt="Skillgate Desktop Team 页面示意" width="100%" />
</p>

</td>
<td width="42%">

**TUI — 全键盘**

`skillgate tui` → 按 `4` 进入 Team。

<p align="center">
  <img src="docs/images/tui-team-preview.svg" alt="Skillgate TUI Team 界面示意" width="100%" />
</p>

</td>
</tr>
</table>

| 入口 | 适合谁 | 启动命令 |
|------|--------|----------|
| **Desktop** | 第一次用、不想记命令 | `skillgate gui` |
| **TUI** | 终端常驻、全键盘 | `skillgate tui` |
| **CLI** | CI / 脚本 / 维护者 | `skillgate apply --profile quant -y` |

三端共用 `cli/src/team-api/`，行为一致。

---

## 核心能力

| 功能 | 做什么 |
|------|--------|
| **Profile** | YAML 定义技能列表 + 目标 Agent（默认 [`quant`](profiles/quant.yaml)：12 skills × 4 agents） |
| **Apply** | 按 profile 安装/链接到本机，受 [`protect.yaml`](protect.yaml) 保护的条目不覆盖 |
| **Doctor** | 对比「已安装」与 profile，列出缺失/版本漂移 |
| **Lock verify** | `skills.lock.yaml` 哈希与磁盘是否一致（可 `--write` 更新） |
| **Catalog drift** | 对比远程 `VERSION`，落后时 Desktop/TUI 显示横幅 |
| **team-init** | 在业务仓库写 `.skillgate/profile` + SessionStart 钩子 |

---

## 快速开始（3 步）

### ① 克隆团队目录

```bash
git clone https://github.com/2233admin/skillgate-team.git ~/.skillgate-team
cd ~/.skillgate-team
```

Windows 示例：`D:\skillgate-team`

### ② 安装并构建

需要 [Bun](https://bun.sh) + **Node 22–25**（勿用 Node 26，会破坏 SQLite 原生模块）。

```bash
bun install --ignore-scripts
bun run build
bun run install-global
```

Windows 桌面版额外执行一次：

```powershell
bun run gui:install
```

### ③ 应用 profile

**命令行：**

```bash
skillgate apply --profile quant -y
skillgate doctor --profile quant
```

**图形界面：**

1. `skillgate gui` 或 `skillgate tui`
2. **设置** → **Team catalog root** = 克隆路径
3. 打开 **Team** → 选 `quant` → **Apply** → **Doctor**

验证安装：`bun run smoke-team`（15 项 Team 工作流检查）

详细图文：[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)

---

## 绑定业务项目

```bash
cd your-app
skillgate team-init --mode required
```

生成 `.skillgate/profile` 与 Claude Code SessionStart 检查。也可在设置里填 **Linked project** 自动读 profile。

---

## 常见问题

<details>
<summary><strong>Team 页显示「目录不可用」</strong></summary>

设置 → **Team catalog root** 填 `git clone` 的路径，或设置环境变量 `SKILLGATE_ROOT`。
</details>

<details>
<summary><strong>Desktop 报 Electron / SQLite 错误</strong></summary>

使用 Node 22–25，在仓库根目录执行 `bun run gui:install`。
</details>

<details>
<summary><strong>维护者更新了技能，成员怎么同步？</strong></summary>

`git pull` → Team 页 **Apply**（或 `skillgate apply -y`）。维护者改完技能后执行 `skillgate lock verify --write` 并提交 lock。
</details>

---

## 仓库结构

| 路径 | 说明 |
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

贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md)

---

## English summary

**Skillgate Team** ships a git-backed skill catalog with profiles, lock files, and drift detection. Install once, open **Team** in the Desktop or TUI app (or use the CLI), select a profile like `quant`, and apply skills to Claude Code, Codex, Cursor, and Grok on your machine.

- Docs: [GETTING_STARTED.md](docs/GETTING_STARTED.md)
- Issues: [bug / feature / help templates](https://github.com/2233admin/skillgate-team/issues/new/choose)

---

<div align="center">

<sub>Legacy repos <code>team-skills</code> / <code>skillgate</code> are deprecated — use this repo.</sub>

</div>