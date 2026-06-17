<div align="center">

<img src="docs/images/logo.svg" width="72" height="72" alt="Skillgate logo" />

# Skillgate Team

**团队 Agent Skills 的版本管理。一个 Git 仓库，全员装同一套。**

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](VERSION)
[![Node](https://img.shields.io/badge/node-22--25-339933?logo=node.js&logoColor=white)](package.json)
[![Bun](https://img.shields.io/badge/bun-1.3.14-black?logo=bun&logoColor=white)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](cli/package.json)
[![Tests](https://img.shields.io/badge/tests-56%20passing-brightgreen)](#开发)

[安装](#安装) · [能干什么](#能干什么) · [界面](#界面长什么样) · [上手](docs/GETTING_STARTED.md) · [提 Issue](https://github.com/2233admin/skillgate-team/issues/new/choose)

</div>

团队里每个人的 `~/.claude/skills` 长得都不一样——这事我见过太多次了。有人多装了三个，有人还在用上周的版本，新人入职要问三遍「到底装哪些」。

Skillgate Team 把技能收进**一个 Git 仓库**。维护者改 `profiles/`，大家 `git pull` 再 Apply，本机四个 Agent 目录就对齐了。不用在群里喊「谁没更新 skill」。

---

## 安装

```bash
git clone https://github.com/2233admin/skillgate-team.git ~/.skillgate-team
cd ~/.skillgate-team

bun install --ignore-scripts
bun run build
bun run install-global
```

Windows 桌面版再多一步：`bun run gui:install`  
环境：**Bun** + **Node 22–25**（Node 26 会把 SQLite 搞崩，别试）。

装完应用默认 profile：

```bash
skillgate apply --profile quant -y
skillgate doctor --profile quant
```

---

## 能干什么

<p align="center">
  <img src="docs/images/architecture.svg" alt="团队目录 → Skillgate → 本机 Agent" width="920" />
</p>

#### 团队目录 — 单一事实源

`skills/` 放技能本体，`profiles/` 写「这支队伍装什么」，`skills.lock.yaml` 把每个文件的哈希钉死。改了什么，lock 对不上，Doctor 会告诉你。

#### Profile — 装什么，一条 YAML 说了算

默认 [`quant`](profiles/quant.yaml)：**12 个技能**，发给 **Claude Code / Codex CLI / Cursor / Grok** 四个 Agent。你不用会写 YAML——日常使用者选好 profile，点 Apply 就行。

#### Apply · Doctor · Lock — 同步和自检

- **Apply**：按 profile 链到本机；[`protect.yaml`](protect.yaml) 标了保护的条目不会误覆盖
- **Doctor**：本机已装 vs profile，缺啥、漂了啥，列出来
- **Lock verify**：磁盘内容和 lock 哈希是否一致；维护者用 `--write` 更新后提交
- **Catalog drift**：远程 `VERSION` 比本地新，Desktop / TUI 顶部挂横幅——该 `git pull` 了

#### Desktop · TUI · CLI — 同一套 `team-api`

不想记命令 → `skillgate gui`  
终端常驻 → `skillgate tui`，按 `4` 进 Team  
接 CI / 脚本 → `skillgate apply --profile quant -y`

三端走 `cli/src/team-api/`，不会出现「GUI 能装、CLI 不行」这种分裂。

#### team-init — 绑到业务仓库

在业务项目跑 `skillgate team-init --mode required`，生成 `.skillgate/profile`，可选挂 Claude Code SessionStart 检查。Desktop 里填 **Linked project** 也能自动读。

### 默认 profile：`quant` 技能一览

面向量化 / 全栈工程队。12 个技能，四个 Agent 一起装。完整清单见 [`profiles/quant.yaml`](profiles/quant.yaml)。

#### coding-standards — 编码底线

命名、可读性、不可变数据、代码审查时的通用规矩。框架细节交给下面的 frontend / backend 技能。

#### frontend-patterns — React / Next 前端

状态管理、性能、组件拆分——日常写 UI 时 Agent 按这套走，少各写各的。

#### nextjs-turbopack — Next.js 16+ 与 Turbopack

增量打包、FS 缓存、dev 速度；什么时候用 Turbopack、什么时候别硬上 webpack。

#### backend-patterns — 后端架构

Node / Express / Next API routes：分层、数据库、服务端常见坑。

#### api-design — REST API 设计

资源命名、状态码、分页、错误体、版本、限流——对外 API 别各端各一套。

#### security-review — 安全审查清单

鉴权、用户输入、密钥、支付相关改动——改这些路径时自动拉 checklist。

#### tdd-workflow — 测试驱动

新功能、修 bug、重构：先测后写，单元 + 集成 + E2E，覆盖率目标 80%+。

#### e2e-testing — Playwright E2E

Page Object、CI 接入、产物、 flaky 处理——端到端别只跑 happy path。

#### verification-loop — 会话级验收

大任务拆阶段，每阶段有验证步骤，避免「改完了其实没跑通」。

#### documentation-lookup — 查现行文档

用 Context7 MCP 拉库文档，不靠训练数据里的过期 API。

#### deep-research — 多源调研

网页搜索 + 交叉验证 + 引用来源——要写调研报告或技术选型时用。

#### strategic-compact — 手动压缩上下文

在逻辑断点建议 compact，别被自动截断砍在半路。

---

## 界面长什么样

> 示意图，布局和真机一致。实拍替换方法见 [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md)。

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

`skillgate tui` → `4` 进 Team → `a` 应用 → `d` 自检。

<p align="center">
  <img src="docs/images/tui-team-preview.svg" alt="TUI Team 页示意" width="100%" />
</p>

</td>
</tr>
</table>

---

## 第一次用（图形界面）

1. `skillgate gui` 或 `skillgate tui`
2. **设置** → **Team catalog root** = 你 clone 的路径（Windows 例：`D:\skillgate-team`）
3. **Team** → 选 `quant` → **Apply** → **Doctor**

跑一遍自检：`bun run smoke-team`（15 项）。更细的三种路径见 [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)。

---

## 常见问题

**Team 页说「目录不可用」？**  
**Team catalog root** 填错或路径不存在。去设置里改成 clone 目录，或设 `SKILLGATE_ROOT` 指向同一位置。

**Desktop 起不来，报 Electron / SQLite？**  
确认 Node 22–25，在仓库根目录跑 `bun run gui:install`。

**维护者更新了技能，我怎么跟？**  
团队目录 `git pull` → Team 页 **Apply**。维护者改完技能后记得 `skillgate lock verify --write`，把 lock 提交上去，大家 Doctor 才对得上。

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
| [`docs/DESIGN.md`](docs/DESIGN.md) | 视觉系统（克制工程风 + 配色约束） |
| [`docs/images/`](docs/images/) | README 配图 |

---

## 开发

```bash
bun install --ignore-scripts
bun run test      # 56 tests
bun run build
bun run graph
```

提 PR 前看 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## English

Git-backed skill catalog for teams: profiles declare what to install, lock files pin hashes, Apply / Doctor / drift checks keep Claude Code, Codex, Cursor, and Grok aligned — CLI, TUI, or Desktop.

- [GETTING_STARTED.md](docs/GETTING_STARTED.md)
- [Issues](https://github.com/2233admin/skillgate-team/issues/new/choose)

---

<div align="center">

<sub>旧仓库 <code>team-skills</code>、<code>skillgate</code> 已弃用。</sub>

</div>
