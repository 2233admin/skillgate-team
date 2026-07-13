<div align="center">

<img src="docs/images/logo.svg" width="72" height="72" alt="Skillgate logo" />

# Skillgate Team

<p>
  <strong>简体中文</strong> · <a href="README.en.md">English</a>
</p>

**团队 Agent Skills 目录。一个 Git 仓库，同步到 Codex CLI 与全系 Agent。**

[![Version](https://img.shields.io/badge/version-0.6.0--team.1-blue)](VERSION)
[![Node](https://img.shields.io/badge/node-22--25-339933?logo=node.js&logoColor=white)](package.json)
[![Bun](https://img.shields.io/badge/bun-1.3.14-black?logo=bun&logoColor=white)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](cli/package.json)
[![Tests](https://img.shields.io/badge/tests-56%20passing-brightgreen)](#开发)
[![Releases](https://img.shields.io/github/v/release/2233admin/skillgate-team?label=releases)](https://github.com/2233admin/skillgate-team/releases)

[安装](#安装) · [能干什么](#能干什么) · [界面](#界面长什么样) · [上手](docs/GETTING_STARTED.md) · [提 Issue](https://github.com/2233admin/skillgate-team/issues/new/choose)

</div>

每人本机的 `~/.codex/skills`、`~/.claude/skills` 各装各的——版本对不上、新人不知道装什么，是团队里最常见的问题。

Skillgate Team 把技能收进**一个 Git 仓库**。维护者改 `profiles/`，成员 `git pull` 后 Apply，本机 **Codex CLI**、Claude Code、Cursor、Grok 四个目录对齐同一套清单。不用在群里追问「谁没更新 skill」。

---

## 安装

### 零脑力版（推荐）

**只做一次：** 装 [Bun](https://bun.sh) 和 [Git](https://git-scm.com/downloads)。从源码开发桌面版还需 [Node 22 LTS](https://nodejs.org) 与 [Rust](https://rustup.rs)。

**Windows（PowerShell，一条命令）：**

```powershell
git clone https://github.com/2233admin/skillgate-team.git $HOME\.skillgate-team; cd $HOME\.skillgate-team; bun run bootstrap
```

要桌面版：把最后一项换成 `bun run bootstrap:desktop`。

**macOS / Linux：**

```bash
git clone https://github.com/2233admin/skillgate-team.git ~/.skillgate-team && cd ~/.skillgate-team && bun run bootstrap
```

还没 clone、想从零开始：

```bash
bun run setup
```

脚本会自动：装依赖 → 编译 → 注册 `skillgate` 命令 → 应用 `quant` profile。  
**装完新开一个终端**，运行 `skillgate doctor --profile quant`。

### 桌面安装包（不用自己编译）

在 [Releases](https://github.com/2233admin/skillgate-team/releases) 下载 Windows、macOS 或 Linux 安装包。装好后：

1. 把本仓库 clone 到 `~/.skillgate-team`（或任意固定路径）
2. 打开 Skillgate → **设置** → **Team catalog root** 填该路径
3. **Team** → `quant` → **Apply**

Releases 由 tag `v*` 自动构建；仓库发版见 [CONTRIBUTING.md](CONTRIBUTING.md#发版)。

### 手动安装（维护者）

```bash
bun install --ignore-scripts && bun run build && bun run install-global
skillgate apply --profile quant -y
```

Windows 桌面开发：`bun run gui:install`，然后 `bun run gui`（React + Tauri 2/Rust）。

Codex CLI 技能目录：`~/.codex/skills`（或 `$CODEX_HOME/skills`）。

---

## 能干什么

<p align="center">
  <img src="docs/images/architecture.svg" alt="团队目录 → Skillgate → 本机 Agent" width="920" />
</p>

#### 团队目录 — 单一事实源

`skills/` 放技能本体，`profiles/` 定义装什么，`skills.lock.yaml` 钉死每个文件的哈希。内容被悄悄改过，Doctor 和 lock verify 会标出来。

#### Profile — 一条 YAML 管全队

默认 [`quant`](profiles/quant.yaml)：**12 个技能**，下发到 **Codex CLI / Claude Code / Cursor / Grok**。日常使用者选好 profile 点 Apply；维护者才改 YAML。

#### Apply · Doctor · Lock — 同步与自检

- **Apply**：按 profile 链到本机 Agent 目录；[`protect.yaml`](protect.yaml) 中的条目不会被覆盖
- **Doctor**：对比本机安装与 profile，列出缺失与漂移
- **Lock verify**：磁盘内容与 lock 哈希是否一致；维护者 `--write` 后提交
- **Catalog drift**：远程 `VERSION` 更新时，Desktop / TUI 顶部提示 `git pull`

#### Desktop · TUI · CLI — 同一套 `team-api`

`skillgate gui` · `skillgate tui`（`4` 进 Team）· `skillgate apply --profile quant -y`  
三端共用 `cli/src/team-api/`，行为一致。

#### team-init — 绑到业务仓库

`skillgate team-init --mode required` 生成 `.skillgate/profile`；Desktop **Linked project** 可自动读取。

### 默认 profile：`quant` 技能一览

面向量化 / 全栈工程。12 技能 × 4 Agent。清单见 [`profiles/quant.yaml`](profiles/quant.yaml)。

#### coding-standards — 编码底线

命名、可读性、不可变数据；框架细节交给 frontend / backend 技能。

#### frontend-patterns — React / Next 前端

状态、性能、组件拆分——写 UI 时统一约定。

#### nextjs-turbopack — Next.js 16+ 与 Turbopack

增量打包、dev 速度；Turbopack 与 webpack 的取舍。

#### backend-patterns — 后端架构

Node / Express / Next API routes 的分层与常见坑。

#### api-design — REST API 设计

资源命名、状态码、分页、错误体、版本与限流。

#### security-review — 安全审查

鉴权、输入、密钥、支付路径——改动时拉 checklist。

#### tdd-workflow — 测试驱动

新功能 / 修 bug / 重构：先测后写，目标 80%+ 覆盖。

#### e2e-testing — Playwright E2E

Page Object、CI、产物与 flaky 处理。

#### verification-loop — 会话级验收

大任务分阶段验证，避免「改完没跑通」。

#### documentation-lookup — 查现行文档

Context7 MCP 拉库文档，避免过期 API。

#### deep-research — 多源调研

搜索、交叉验证、引用来源。

#### strategic-compact — 手动压缩上下文

在逻辑断点 compact，减少半路截断。

---

## 界面长什么样

> 示意图，布局与真机一致。实拍见 [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md)。

<table>
<tr>
<td width="58%">

**Desktop**

设置 **Team catalog root** → 选 profile → Apply → Doctor。

<p align="center">
  <img src="docs/images/desktop-team-preview.svg" alt="Desktop Team 页示意" width="100%" />
</p>

</td>
<td width="42%">

**TUI**

`skillgate tui` → `4` → `a` 应用 → `d` 自检。

<p align="center">
  <img src="docs/images/tui-team-preview.svg" alt="TUI Team 页示意" width="100%" />
</p>

</td>
</tr>
</table>

---

## 第一次用

1. `skillgate gui` 或 `skillgate tui`
2. **设置** → **Team catalog root** = clone 路径
3. **Team** → `quant` → **Apply** → **Doctor**

`bun run smoke-team`（15 项）。详细路径见 [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)。

---

## 常见问题

**Team 页「目录不可用」？**  
**Team catalog root** 路径错误或不存在；或设置 `SKILLGATE_ROOT`。

**Desktop 起不来？**  
安装包用户请在 Release 附件中选择对应系统与架构；源码开发执行 `bun run gui:install`。

**维护者更新了技能？**  
`git pull` → **Apply**；维护者 `skillgate lock verify --write` 并提交 lock。

---

## 仓库地图

| 路径 | 内容 |
|------|------|
| [`skills/`](skills/) | 团队 vendored 技能 |
| [`profiles/`](profiles/) | Profile 定义 |
| [`skills.lock.yaml`](skills.lock.yaml) | 内容哈希锁定 |
| [`cli/`](cli/) | `skillgate` CLI + `team-api` |
| [`desktop-tauri/`](desktop-tauri/) | React + Tauri 2/Rust 桌面应用 |
| [`desktop/`](desktop/) | 迁移期 Electron 只读兼容参考；不再作为发布目标 |
| [`tui/`](tui/) | OpenTUI 终端 UI |
| [`docs/DESIGN.md`](docs/DESIGN.md) | 视觉系统 |
| [`docs/images/`](docs/images/) | 配图 |

---

## 开发

```bash
bun install --ignore-scripts
bun run test
bun run build
bun run gui:tauri:check
node --test scripts/release-tools.test.mjs
bun run graph
```

提 PR 前见 [CONTRIBUTING.md](CONTRIBUTING.md)。
