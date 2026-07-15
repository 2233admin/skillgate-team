# 第一次上手

<p>
  <strong>简体中文</strong> · <a href="GETTING_STARTED.en.md">English</a>
</p>

配合 [README.md](../README.md) 使用。

<p align="center">
  <img src="images/architecture.svg" alt="架构示意" width="720" />
</p>

---

## 零脑力安装（大多数人只走这里）

| 步骤 | 做什么 |
|------|--------|
| 0 | 装 [Bun](https://bun.sh) + [Git](https://git-scm.com/downloads)（源码开发桌面版再加 [Node 22](https://nodejs.org) 与 [Rust](https://rustup.rs)） |
| 1 | Clone 仓库到 `~/.skillgate-team` |
| 2 | 在仓库根目录执行 **`bun run bootstrap`**（桌面版：`bun run bootstrap:desktop`） |
| 3 | **新开终端** → `skillgate doctor --profile quant` |
| 4 | 想用图形界面 → `skillgate gui`，在设置里填 **Team catalog root**（就是 clone 路径） |

一条命令（已装 Bun + Git）：

```powershell
git clone https://github.com/2233admin/skillgate-team.git $HOME\.skillgate-team; cd $HOME\.skillgate-team; bun run bootstrap
```

正式签名安装包会在迁移 ledger 门禁完成后发布到 [GitHub Releases](https://github.com/2233admin/skillgate-team/releases)。迁移预览期的完整 Team 工作流请使用 CLI/TUI 或 Electron 兼容界面。

**卡住？** 用 [求助模板](https://github.com/2233admin/skillgate-team/issues/new?template=help_request.yml)，附上 `bun -v`、`node -v`、完整报错。

---

## 先弄清五个词

- **团队目录** — 本仓库（`skills/`、`profiles/`、`skills.lock.yaml`）
- **Profile** — YAML，定义装哪些技能、发给哪些 Agent；默认 `quant`
- **Apply** — 按 profile 链到本机 `~/.codex/skills`、`~/.claude/skills` 等
- **Doctor** — 本机安装 vs profile 的差异
- **Lock** — `skills.lock.yaml` 哈希；悄悄改过目录，verify 会对不上

日常：**选 profile → Apply**。维护者才动 YAML 和 lock。

---

## 路径 A：桌面版

### 准备

Clone 到固定路径（避免中文与空格），例如 `~/.skillgate-team` 或 `D:\skillgate-team`。

### 安装

优先：**`bun run bootstrap:desktop`**（Windows），或 Releases 安装包 + 绑团队目录。

维护者手动装依赖：

```powershell
bun run bootstrap:desktop
# 等价于 bootstrap + install-tauri-gui.ps1
```

### 打开后

```bash
skillgate gui
```

1. **设置** → **Team catalog root** = clone 路径  
2. （可选）**Linked project** = 业务仓库  
3. **Team** → `quant` → **Apply** → **Doctor**  
4. 界面语言：**设置** → **语言**（默认简体中文，可切英文）

顶部横幅提示目录落后 → `git pull` 后再 Apply。

---

## 路径 B：终端 UI

```bash
skillgate tui
```

| 键 | 作用 |
|----|------|
| `4` | Team |
| `j` / `k` | 选 profile |
| `a` | Apply |
| `d` | Doctor |
| `l` | 验证 lock |
| `r` | 刷新 drift |
| `s` | 设置 team.root |
| `?` | 快捷键 |

「目录不可用」→ `s` 设置 **team.root**。

---

## 路径 C：纯命令行

```bash
export SKILLGATE_ROOT=~/.skillgate-team

skillgate apply --profile quant -y
skillgate doctor --profile quant
skillgate lock verify
skillgate smoke-test
```

绑业务项目：

```bash
cd ~/projects/my-app
skillgate team-init --mode required
```

---

## `quant` profile

**12 技能** × **4 Agent**（**codex-cli**、claude-code、cursor、grok）。

技能说明见 [README.md](../README.md#默认-profilequant-技能一览)。YAML：[profiles/quant.yaml](../profiles/quant.yaml)。

维护者：改 `profiles/*.yaml` → `skillgate lock verify --write` → 提交 → 成员 `git pull` + Apply。

---

## 目录落后

1. `git pull`
2. Team 页看本地 / 远程版本
3. 再 **Apply**
4. 维护者提交更新后的 lock

`team-init --mode required` 会在 Claude Code 启动时提示 `TEAM_CATALOG_UPGRADE`。

---

## 验证

```bash
bun run smoke-team
```

应通过 15 项。

---

## 求助

[Issue 模板](https://github.com/2233admin/skillgate-team/issues/new?template=help_request.yml) — 附上系统、Node/Bun 版本、CLI/TUI/Desktop、**Team catalog root**、完整报错。
