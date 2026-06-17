# Skillgate Team — 视觉系统

**气质**：克制、干净、偏工程工具的高级感。明日方舟只作**点缀**（琥珀 + 青绿双强调），不做作战面板、不做斜切堆砌。

**文档**：`README.md` / `docs/GETTING_STARTED.md` 为中文默认入口；英文见 `README.en.md` / `docs/GETTING_STARTED.en.md`。`*.zh-CN.md` 仅作旧链接跳转。产品叙事以 **Codex CLI**（`~/.codex/skills`）为首要同步目标，其余 Agent 并列。

## 原则

| 要做 | 不做 |
|------|------|
| 浅底文档图 + 深底应用示意，信息清晰 | 大红楔、满屏网格、扫描线动画 |
| Logo 三门 + 三点（琥珀 / 青 / 琥珀） | 动效 SVG、横幅 hero |
| 强调色只出现在边框、节点、角标 | 解构平行四边形、全大写战术标签 |

## 色板

| Token | 值 | 用途 |
|-------|-----|------|
| `bg-doc` | `#FAFAFA` | README 架构图、社交封面底 |
| `bg-app` | `#0C0C0D` / `#141516` | Desktop / TUI 示意 |
| `text` | `#0C0C0D` / `#F7F8F8` | 主文案 |
| `text-muted` | `#6B6F76` / `#8A8F98` | 次要 |
| `accent-amber` | `#D4A054` | 明日方舟式暖强调（顶栏告警、节点、细线） |
| `accent-cyan` | `#2EC4B6` | 链路 / 选中 / 标签 |
| `border` | `#E6E6E8` / `#2E2E32` | 分割 |

主按钮用 `#1C1917` 深底白字，不用高饱和色块。

## 资产

| 文件 | 说明 |
|------|------|
| `logo.svg` | README 顶栏 72px，静态 |
| `architecture.svg` | 三栏流程，浅底 |
| `social-preview.svg` | 1280×640 |
| `desktop-team-preview.svg` | 深底 Desktop |
| `tui-team-preview.svg` | 深底 TUI |

实拍替换：[SCREENSHOTS.md](./SCREENSHOTS.md)

## 禁止

- README 致谢式 blockquote（借鉴 XX 审美）
- 动效横幅、SMIL 脉冲、苏联构成主义大色块
- 单一品牌紫（旧 Linear 色）