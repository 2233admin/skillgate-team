# Skillgate Team

**团队技能目录 + 一键分发** — 把 `skills/`、`profiles/`、`skills.lock.yaml` 打包成一个仓库，让 Claude Code、Codex、Cursor、Grok 等 Agent 用同一套技能。

> **English:** One repo for team skill distribution: vendored catalog, profiles, lock file, and CLI/TUI/Desktop to apply them to your agents.

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](VERSION)
[![Node](https://img.shields.io/badge/node-22--25-green)](package.json)

---

## 适合谁用？

| 你是… | 推荐入口 |
|--------|----------|
| 第一次用，想点按钮 | **桌面版** `skillgate gui` → 顶部 **Team** |
| 习惯终端，要全键盘 | **TUI** `skillgate tui` → 按 `4` 进 Team |
| 写脚本 / CI / 老手 | **CLI** `skillgate apply --profile quant` |

三种方式共用同一套 **team-api**（目录、profile、doctor、lock、目录漂移检测）。

---

## 5 分钟上手

### 1. 克隆团队目录

```bash
git clone https://github.com/2233admin/skillgate-team.git ~/.skillgate-team
cd ~/.skillgate-team
```

Windows 示例：`git clone ... D:\skillgate-team`，后面路径换成你的实际目录。

### 2. 安装 CLI

需要 **Bun** 和 **Node 22–25**（Windows 上 Node 26 会破坏 `better-sqlite3` 等原生模块）。

```bash
bun install --ignore-scripts
bun run build
node cli/bin/skillgate.mjs install-global
# 刷新 PATH 后也可：skillgate install-global
```

### 3. 应用默认 profile（quant）

```bash
skillgate lock verify --write   # 首次：把 lock 与磁盘对齐（维护者才需要）
skillgate apply --profile quant -y
skillgate doctor --profile quant
```

### 4. 用图形界面（可选）

**终端 UI：**

```bash
bun run tui
# 或 skillgate tui
# Tab 4 = Team · a=应用 · d=检查 · ? = 快捷键帮助
```

**桌面版（Windows 一次性安装原生依赖）：**

```powershell
bun run gui:install    # Electron + better-sqlite3 编译
bun run gui            # 或 skillgate gui
# 设置 → Team catalog root → Team 页 → 应用 profile
```

### 5. 自检

```bash
bun run smoke-test     # CLI 冒烟
bun run smoke-team     # Team 工作流 15 步（API + 配置）
```

---

## Team 页能做什么？

在 **Team** 标签里（TUI 按 `4`，Desktop 侧边栏 **Team**）：

1. **选 profile** — 例如 `quant`（12 个技能，4 个 Agent）
2. **Apply** — 把 profile 里的技能装到本机已检测的 Agent
3. **Doctor** — 对比「已安装」和 profile，列出漂移
4. **Lock verify** — 校验 `skills.lock.yaml` 与磁盘哈希是否一致
5. **目录漂移** — 启动时对比远程 `VERSION`，落后时显示横幅

维护者更新技能后：`git pull` → 在 Team 页点 **Apply** 或 `skillgate apply -y`。

更细的图文说明见 [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)。

---

## 绑定到你的项目

在业务仓库根目录：

```bash
skillgate team-init --mode required
```

会生成：

- `.skillgate/profile` — 例如 `quant`
- `.claude/hooks/check-skillgate.sh` — SessionStart 时检查目录是否落后

也可在 **设置** 里填 **Linked project**，Team 会读该项目的 `.skillgate/profile`。

---

## 环境变量

| 变量 | 作用 |
|------|------|
| `SKILLGATE_ROOT` | 团队目录路径（默认 `~/.skillgate-team`） |
| `SKILLGATE_TEAM_REMOTE_URL` | 用 raw `VERSION` URL 检测远程版本（优先于 git） |
| `SKILLGATE_TEAM_REMOTE_REPO` | 用 git remote 检测目录漂移 |

---

## 常见问题

**Team 页显示「目录不可用」**  
→ 设置里填 **Team catalog root**（克隆下来的仓库路径），或设置 `SKILLGATE_ROOT`。

**`skillgate gui` 报 Electron 未安装**  
→ 在仓库根目录执行 `bun run gui:install`（Node 22–25）。

**TUI / Desktop 起不来、SQLite 报错**  
→ 不要用 Node 26；Windows 用 `gui:install` 里的 `better-sqlite3` 编译流程。

**`bun install` 原生脚本失败**  
→ 使用 `bun install --ignore-scripts`，GUI 再单独 `gui:install`。

**技能装在哪儿？**  
→ 各 Agent 默认目录（如 `~/.claude/skills`），`protect.yaml` 里的条目不会被覆盖。

---

## 仓库结构

```
skillgate-team/
├── skills/              # 团队 vendored 技能
├── profiles/            # 如 quant.yaml
├── skills.lock.yaml     # 技能内容哈希
├── protect.yaml         # 永不覆盖（如 OMC）
├── cli/                 # skillgate 命令行
├── tui/                 # OpenTUI 终端界面
├── desktop/             # Electron 桌面应用
├── ui/                  # 共享组件
└── docs/                # 设计与入门文档
```

---

## 开发

```bash
bun install --ignore-scripts
bun run test          # 全仓测试
bun run build         # 构建 CLI
bun run graph         # Nx 依赖图
```

贡献与提 Issue 见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 历史说明

早期曾拆成 `team-skills` / `skillgate` 两个仓库；**请统一使用本仓库**。