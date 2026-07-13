# Contributing

感谢参与 Skillgate Team。本仓库是 **团队技能目录（含 Codex CLI `~/.codex/skills`）+ CLI/TUI/Desktop**，贡献前请先读 [README.md](README.md)（中文）/ [README.en.md](README.en.md) 与 [上手文档](docs/GETTING_STARTED.md)。

## 报告问题

请用 GitHub Issue 模板（不要留空标题）：

- **Bug** — 可复现步骤 + 环境（OS、Node/Bun 版本、CLI/TUI/Desktop）
- **功能建议** — 使用场景 + 期望行为
- **求助** — 已尝试的步骤 + 报错全文

## 开发环境

```bash
git clone https://github.com/2233admin/skillgate-team.git
cd skillgate-team
bun install --ignore-scripts
bun run test
bun run build
```

Windows 桌面开发额外执行 `bun run gui:install`（Node 22+、Rust 1.85+）。

## 改技能 / Profile

1. 编辑 `skills/` 或 `profiles/*.yaml`
2. `skillgate lock verify --write` 更新 `skills.lock.yaml`
3. `skillgate doctor --profile <name>` 确认无意外漂移
4. PR 说明影响哪些 Agent、是否需要成员重新 Apply

`protect.yaml` 中的路径不会被 apply 覆盖，勿随意删除。

## 改 Team UI / API

- 业务逻辑放在 `cli/src/team-api/`（Desktop/TUI/CLI 共用）
- 设计文档：`docs/superpowers/specs/2026-06-17-team-workflows-gui-tui-design.md`
- 提交前：`bun run test` 与 `bun run smoke-team`

## PR 约定

- 一个 PR 解决一件事
- 更新用户可见行为时同步改 README 或 `docs/GETTING_STARTED.md`
- 使用 [PR 模板](.github/PULL_REQUEST_TEMPLATE.md)

## 发版

1. 更新根目录 `VERSION`，并同步 root/CLI/TUI/Desktop package 版本与 Tauri/Cargo 版本。
2. 配置 GitHub Actions：`TAURI_UPDATER_PUBLIC_KEY` variable，以及 updater 私钥、Windows Authenticode、Apple Developer ID/公证所需 secrets。密钥不得提交到仓库。
3. 本地运行发布预检与测试：

```bash
bun run release:check
node --test scripts/release-tools.test.mjs
bun run test
bun run gui:tauri:check
```

4. 提交并 push `master`，打与 `VERSION` 完全一致的 tag：

```bash
git tag v0.6.0-team.1
git push origin v0.6.0-team.1
```

CI 会跑 TypeScript/Rust 测试，在 Windows、macOS、Linux 上构建系统签名安装包与 Tauri 更新签名，生成校验和及 `latest.json`，并创建 **Draft** [GitHub Release](https://github.com/2233admin/skillgate-team/releases)。维护者完成干净机器安装、启动、升级和回滚验证后，才可手动发布 Draft。

## 行为准则

尊重协作者时间：提供可复现信息，避免「不工作」而无上下文的 Issue。
