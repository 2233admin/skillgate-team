# README 配图维护

README 使用 `docs/images/` 下的矢量示意图，保证 GitHub 上始终能显示、不依赖本机截图环境。

配色、构图与 SMIL 动效约束见 [DESIGN.md](./DESIGN.md)（暗底工业 HUD · 解构斜切 · 橙/青双强调）。

## 文件说明

| 文件 | 用途 |
|------|------|
| `hero.svg` | README 顶栏动效横幅（扫描线、节点脉冲） |
| `logo.svg` | 小尺寸图标 / favicon 类场景 |
| `architecture.svg` | 架构数据流（虚线流动动画） |
| `desktop-team-preview.svg` | Desktop Team 页 HUD 示意 |
| `tui-team-preview.svg` | TUI Team 页战术终端示意 |
| `social-preview.svg` | GitHub 仓库 Social Preview（1280×640，在仓库 Settings → General 上传） |

## 换成真实截图（可选）

1. 启动桌面版：`skillgate gui`（或 `bun run gui`）
2. 设置 → **Team catalog root** 指向本仓库
3. 打开 **Team**，选好 `quant`，界面稳定后截屏
4. 保存为 `docs/images/desktop-team-screenshot.png`（建议宽度 1200px）
5. 在 `README.md` 的界面预览处把 `desktop-team-preview.svg` 改为该 PNG
6. 提交并 push

TUI 同理：`skillgate tui` → `4` → 截屏 → `tui-team-screenshot.png`。

## GitHub 仓库卡片

在 **Settings → General → Social preview** 上传 `docs/images/social-preview.svg`（或导出 PNG 后上传）。

在 **About** 填写简短描述，例如：

> 团队 AI 技能目录：Git 锁定 profile，Desktop / TUI / CLI 一键 Apply

Topics 建议：`ai-agents` `claude-code` `skills` `electron` `developer-tools`