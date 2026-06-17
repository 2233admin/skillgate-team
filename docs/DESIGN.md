# Skillgate Team — 设计系统

**哲学**：Linear 式工程工具审美 + 第一性原理取舍。

## 第一性原理（视觉也要服从）

| 问题 | 本质 | 设计推论 |
|------|------|----------|
| 团队 skills 为何乱？ | 没有单一事实源 | 信息图只画一条链：目录 → Skillgate → Agent |
| 用户要信什么？ | 可验证状态（lock / doctor） | 用数据行、等宽字，不用装饰性插画 |
| 产品是什么？ | 基础设施，不是营销页 | 浅色文档面 + 克制强调色，拒绝渐变光晕 |

删掉一切不服务于「对齐、验证、应用」的视觉元素。

## Linear 式约束

- **留白即结构**：模块间距 8 的倍数；卡片内边距充足，不堆 badge
- **层级靠字号与灰阶**，不靠阴影与发光
- **1px 边框** 分隔区域（`#E6E6E8` 浅 / `#2E2E32` 深）
- **一个强调色**：品牌紫 `#5E6AD2`，仅用于焦点、选中、主按钮
- **字体**：UI 用 system-ui / Inter；路径与 lock 用等宽

## 色板

| Token | 浅色（README / Social） | 深色（Desktop 示意） |
|-------|-------------------------|----------------------|
| `bg-base` | `#F9F9FB` | `#141516` |
| `bg-elevated` | `#FFFFFF` | `#1C1C1F` |
| `border` | `#E6E6E8` | `#2E2E32` |
| `text-primary` | `#0C0C0D` | `#F7F8F8` |
| `text-secondary` | `#6B6F76` | `#8A8F98` |
| `text-tertiary` | `#9CA0A8` | `#6B6F76` |
| `accent` | `#5E6AD2` | `#5E6AD2` |
| `accent-subtle` | `#5E6AD214` | `#5E6AD226` |
| `warning` | `#B45309` | `#F59E0B` |

花叔 `huashu-design` 禁区：**赛博霓虹、深蓝渐变底（`#0D1117` 一类）** — 本系统不用。

## Logo

- **门（gate）**：左右立柱 + 顶梁，表示「准入 / 同步边界」
- **三点**：团队目录里 skills 经 Skillgate 对齐到本机；强调色 `#5E6AD2`
- 单色可反白；README 默认深描边 + 紫点

## 配图清单

| 文件 | 用途 |
|------|------|
| `logo.svg` | README 顶栏 |
| `architecture.svg` | 数据流（浅底） |
| `social-preview.svg` | GitHub Social preview |
| `desktop-team-preview.svg` | Desktop Team 页（深底，贴近 Linear 应用） |
| `tui-team-preview.svg` | TUI（深底终端） |

实拍替换见 [SCREENSHOTS.md](./SCREENSHOTS.md)。

## 文案调性（与视觉一致）

- 写「Apply profile」「Doctor 无漂移」，不写「赋能」「一站式」
- 按钮动词开头：Apply、Verify、Refresh

---

参考：[Linear](https://linear.app) 产品界面气质；文档结构借鉴 [huashu-skills](https://github.com/alchaincyf/huashu-skills)；视觉由本文件约束，非 huashu-design 自动生成。