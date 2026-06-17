# Team Workflows GUI+TUI 实现计划

> **面向 AI 代理的工作者：** 必需子技能：subagent-driven-development 或 executing-plans。步骤使用 `- [ ]` 跟踪进度。

**目标：** 在 Desktop 与 TUI 中提供完整 team 工作流（profile / apply / doctor / lock verify / catalog drift），通过 `cli` 内 `team-api` 库驱动。

**架构：** `cli/src/team-api` 导出结构化 API；CLI 命令变薄；Desktop main IPC 调用；TUI 直接 import。共享 SQLite settings 键 `team.root` / `team.linkedProject` / `team.lastProfile`。

**技术栈：** Bun workspaces, Nx, TypeScript, Electron, OpenTUI, Vitest.

**设计规格：** `docs/superpowers/specs/2026-06-17-team-workflows-gui-tui-design.md`

---

## 并行分工（3 agents）

| Stream | 目录 | 依赖 |
|--------|------|------|
| **A — CLI** | `cli/` | 无（先行或与其他并行，但必须先 export API） |
| **B — Desktop** | `desktop/` | `skillgate` team-api + workspace dep |
| **C — TUI** | `tui/` | `skillgate` team-api + workspace dep |

---

## 文件清单

### Stream A — CLI

| 文件 | 职责 |
|------|------|
| `cli/src/team-api/types.ts` | Result, TeamContext, error codes |
| `cli/src/team-api/context.ts` | `resolveTeamContext` |
| `cli/src/team-api/profiles.ts` | `listProfiles`, `getProfileSummary` |
| `cli/src/team-api/apply.ts` | `runApply` (extract from commands/apply.ts) |
| `cli/src/team-api/doctor.ts` | `runDoctor` |
| `cli/src/team-api/lock-verify.ts` | `runLockVerify` |
| `cli/src/team-api/catalog-drift.ts` | `checkCatalogDrift` (from update-check) |
| `cli/src/team-api/state.ts` | `getLastApplyState` |
| `cli/src/team-api/index.ts` | re-exports |
| `cli/package.json` | add `exports`, `skillgate` workspace dep for desktop/tui |
| `cli/src/commands/apply.ts` | thin wrapper |
| `cli/src/commands/doctor.ts` | thin wrapper |
| `cli/src/commands/lock-verify.ts` | thin wrapper |
| `cli/src/commands/update-check.ts` | thin wrapper |
| `cli/src/team-api/*.test.ts` | vitest |

### Stream B — Desktop

| 文件 | 职责 |
|------|------|
| `desktop/package.json` | add `"skillgate": "*"` dependency |
| `desktop/src/main/team-ipc.ts` | IPC handlers calling team-api |
| `desktop/src/main/ipc-handlers.ts` | register team IPC |
| `desktop/src/main/index.ts` | startup drift check |
| `desktop/src/preload/*.ts` | expose team IPC to renderer |
| `desktop/src/renderer/routes/team.tsx` | Team page UI |
| `desktop/src/renderer/routes/home.tsx` | sidebar Team nav + badge |
| `desktop/src/renderer/routes/settings.tsx` | team.root, team.linkedProject |
| `desktop/src/renderer/i18n/messages/*.ts` | team strings |
| `desktop/src/renderer/App.tsx` or router | `/team` route |

### Stream C — TUI

| 文件 | 职责 |
|------|------|
| `tui/package.json` | add `"skillgate": "*"` |
| `tui/src/views/team.tsx` | Team view |
| `tui/src/data/use-team.ts` | drift + context hook |
| `tui/src/components/layout.tsx` | Team tab + badge |
| `tui/src/store/types.ts` | `"team"` view |
| `tui/src/views/settings.tsx` | team settings defs |

---

## Stream A 任务

### 任务 A1：team-api 骨架 + types

- [ ] 创建 `cli/src/team-api/types.ts` 与 `index.ts`
- [ ] 添加 `cli/package.json` exports: `"./team-api": "./dist/team-api/index.js"`（或 tsup entry）
- [ ] 更新 `cli/tsup.config` 增加 team-api entry（如存在）

### 任务 A2：context + profiles

- [ ] `resolveTeamContext({ teamRoot?, linkedProject?, profile?, settings? })`
- [ ] `listProfiles`, `getProfileSummary`
- [ ] 测试：`cli/src/team-api/context.test.ts`

### 任务 A3：runDoctor + runLockVerify

- [ ] 从 `commands/doctor.ts` / `lock-verify.ts` 提取逻辑
- [ ] 返回 `Result<>`，无 `process.exit`
- [ ] 测试 fixture 临时目录

### 任务 A4：runApply

- [ ] 从 `commands/apply.ts` 提取；保留 protect / vendored 逻辑
- [ ] `getLastApplyState` 读 state.json
- [ ] 测试（mock agents 或 temp dirs）

### 任务 A5：checkCatalogDrift

- [ ] 从 `update-check.ts` 提取；返回结构化结果 + `fromCache`
- [ ] 测试 throttle with fake timestamps

### 任务 A6：CLI 薄包装 + 回归

- [ ] Refactor 四个 command 文件调用 team-api
- [ ] `cd cli && bun run test` — 11 tests pass
- [ ] Commit: `feat(cli): add team-api library for GUI/TUI`

---

## Stream B 任务（Desktop）

### 任务 B1：依赖与 IPC

- [ ] `desktop/package.json` → `"skillgate": "*"`
- [ ] `desktop/src/main/team-ipc.ts` — handlers for all team:* channels
- [ ] Preload bridge + types

### 任务 B2：启动 drift + badge state

- [ ] Main onReady: `checkCatalogDrift({ force: false })`
- [ ] Push state to renderer (store or event)

### 任务 B3：Team 页面

- [ ] `routes/team.tsx` — banner, context, profile select, actions, results
- [ ] Confirm modals for apply / lock write
- [ ] Router `/team`

### 任务 B4：Settings + nav

- [ ] Settings fields `team.root`, `team.linkedProject`
- [ ] Sidebar Team item with badge
- [ ] i18n zh-CN + en

### 任务 B5：测试

- [ ] `nx run @skillgate/desktop:test` — existing 31 + new IPC unit tests
- [ ] Commit: `feat(desktop): Team tab with team workflows`

---

## Stream C 任务（TUI）

### 任务 C1：依赖与 types

- [ ] `tui/package.json` → `"skillgate": "*"`
- [ ] `ViewName` += `"team"`

### 任务 C2：use-team + team view

- [ ] `tui/src/data/use-team.ts`
- [ ] `tui/src/views/team.tsx` — parity with desktop sections
- [ ] Modals for apply / lock write

### 任务 C3：layout + settings

- [ ] Tab + badge in `layout.tsx`
- [ ] Settings defs for team keys
- [ ] Keyboard shortcuts

### 任务 C4：验证

- [ ] `bun run tui` smoke — Team tab renders
- [ ] Commit: `feat(tui): Team tab with team workflows`

---

## 集成任务（任一 agent 完成后）

- [ ] 根目录 `bun run test` — cli + desktop 全绿
- [ ] 更新 `cli/UPSTREAM.md` 或 README 一句：GUI/TUI team 已接线
- [ ] Final commit / PR message

---

## 验收清单

- [ ] 无终端：选 profile → apply → doctor → lock verify
- [ ] Drift behind 时 Desktop + TUI 角标一致
- [ ] Settings 两端共用 `team.*` keys
- [ ] CLI 行为与重构前一致