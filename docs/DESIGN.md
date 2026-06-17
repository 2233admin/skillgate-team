# Skillgate Team — 视觉系统

**气质**：明日方舟式工业 HUD × 解构主义构图 × 苏联前卫几何（构成主义 / 罗德岛终端感）。

不是 SaaS 浅色营销页，也不是 Linear 紫。是**作战面板**：暗底、斜切、网格、双强调色、会动的扫描线。

## 第一性原理

| 本质 | 视觉表达 |
|------|----------|
| 单一事实源 | 一条硬连线：CATALOG → DISPATCH → LOCAL |
| 可验证 | 等宽数据行、状态灯、LOCK / DRIFT 标签 |
| 团队同步 | Logo 三门 + 三点脉冲 = 对齐节拍 |

装饰必须像「系统 UI」，不能像贴纸。

## 色板

| Token | 值 | 用途 |
|-------|-----|------|
| `bg-void` | `#0A0A0C` | 主背景 |
| `bg-panel` | `#141418` | 面板 |
| `grid` | `#FFFFFF0A` | 战术网格 |
| `text-primary` | `#E7E5E4` | 主文案 |
| `text-muted` | `#78716C` | 次要 |
| `ops-orange` | `#F5A524` | 主强调 / 告警 / 选中 |
| `sync-cyan` | `#2EC4B6` | 次强调 / 链路 / 在线 |
| `soviet-red` | `#C41E3A` | 斜切色块、构成主义楔 |
| `border` | `#2A2A30` | 1px 硬边 |

## 构图规则（解构 + 前卫）

- **斜切**：面板用 `polygon` 或平行四边形裁切，禁止圆角卡片堆叠
- **叠层**：色块可压在网格上，信息块允许 2–4° 视觉错位
- **标签**：全大写 + 字间距（`OPERATION` `SYNC` `CATALOG`）
- **动效**（README SVG）：扫描线、节点脉冲、网格呼吸——用 SMIL，GitHub 可播

## 资产

| 文件 | 说明 |
|------|------|
| `hero.svg` | README 顶栏动效横幅 |
| `logo.svg` | 图标 / 小尺寸 |
| `architecture.svg` | 解构数据流 |
| `social-preview.svg` | 1280×640 社交封面 |
| `desktop-team-preview.svg` | Desktop HUD 示意 |
| `tui-team-preview.svg` | 终端战术视图 |

实拍替换：[SCREENSHOTS.md](./SCREENSHOTS.md)

## 禁止

- README 里写「借鉴 XX」「遵循 XX 审美」的致谢式 blockquote
- 浅灰 SaaS 底 + 单一品牌紫
- 无意义的渐变光晕 blob