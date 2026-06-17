# 第一次上手

配合 [README](../README.md) 使用。如果你已经 clone 完仓库，按下面三条路径选一条走下去就行。

<p align="center">
  <img src="images/architecture.svg" alt="架构示意" width="720" />
</p>

---

## 先弄清五个词

| 名词 | 含义 |
|------|------|
| **团队目录** | 就是这个仓库：`skills/`、`profiles/`、`skills.lock.yaml` |
| **Profile** | 一份 YAML，写死「装哪些技能、发给哪些 Agent」——默认用 `quant` |
| **Apply** | 按 profile 把技能链到本机 `~/.claude/skills` 等目录 |
| **Doctor** | 看本机实际安装和 profile 差在哪 |
| **Lock** | `skills.lock.yaml` 里的内容哈希；目录被人改过，verify 会对不上 |

不用会写 YAML。日常使用者：选 profile → Apply → 完事。

---

## 路径 A：桌面版

### 准备

1. 安装 [Bun](https://bun.sh) 和 **Node 22 或 25**（不要用 26）。
2. 克隆仓库到固定位置，例如：
   - macOS/Linux: `~/.skillgate-team`
   - Windows: `D:\skillgate-team`

### 安装

在仓库根目录：

```powershell
# Windows
bun install --ignore-scripts
bun run build
bun run gui:install
bun run install-global
```

```bash
# macOS / Linux（无 gui:install 时先 bun install）
bun install --ignore-scripts
bun run build
bun run install-global
# 若需桌面版，再按 README 安装 Electron 依赖
```

### 第一次打开

```bash
skillgate gui
# 或 bun run gui
```

1. 打开 **设置 (Settings)**。
2. **Team catalog root** 填克隆路径（如 `D:\skillgate-team`）。
3. （可选）**Linked project** 填你的业务项目，它会读 `.skillgate/profile`。
4. 侧边栏点 **Team**。
5. 下拉选 `quant` → 点 **Apply profile** → 确认。
6. 点 **Run doctor**，应显示无漂移。

若顶部出现黄色横幅「目录可能落后」，先 `git pull` 再 Apply。

---

## 路径 B：终端 UI（全键盘）

```bash
skillgate tui
```

| 按键 | 作用 |
|------|------|
| `4` | 切换到 Team |
| `j` / `k` | 上下选 profile |
| `a` | 应用 profile |
| `d` | 运行 doctor |
| `l` | 验证 lock |
| `r` | 刷新目录漂移 |
| `s` | 设置（配置 team.root） |
| `?` | 快捷键总表 |

错误时：按 `s` 进入设置，填 **team.root** 为仓库路径。

---

## 路径 C：只用命令行

```bash
export SKILLGATE_ROOT=~/.skillgate-team   # Windows: set SKILLGATE_ROOT=D:\skillgate-team

skillgate apply --profile quant -y
skillgate doctor --profile quant
skillgate lock verify
skillgate smoke-test
```

在业务项目里绑定：

```bash
cd ~/projects/my-app
skillgate team-init --mode required
```

---

## Profile `quant` 包含什么？

见 [profiles/quant.yaml](../profiles/quant.yaml)：

- **技能**：coding-standards、frontend-patterns、nextjs-turbopack、tdd-workflow 等 12 个
- **Agent**：claude-code、codex-cli、cursor、grok

团队换 profile 或增删技能时，改 `profiles/*.yaml` 并更新 lock，成员 `git pull` 后 Apply。

---

## 目录落后时怎么办？

1. 在团队目录执行 `git pull`。
2. Team 页横幅会提示本地/远程版本号。
3. 再 **Apply** 一次同步技能。
4. 维护者改完技能后运行 `skillgate lock verify --write` 提交 lock。

SessionStart 钩子（`team-init --mode required`）也会在 Claude Code 启动时提示 `TEAM_CATALOG_UPGRADE`。

---

## 验证安装成功

```bash
bun run smoke-team
```

应通过 15 项检查（context、profiles、drift、doctor 等）。

---

## 还是卡住？

用 **[求助 / 使用问题](https://github.com/2233admin/skillgate-team/issues/new?template=help_request.yml)** 模板发帖。把下面几项贴全，我们好对症：

- 操作系统与 Node/Bun 版本
- 用的是 CLI / TUI / Desktop
- Team catalog root 填的路径
- 完整报错截图或终端输出