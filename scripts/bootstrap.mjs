#!/usr/bin/env node
/**
 * One-shot repo bootstrap: deps → build → global CLI → (optional) desktop → apply quant.
 * Run from repo root: node scripts/bootstrap.mjs
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO_URL = "https://github.com/2233admin/skillgate-team.git";
const DEFAULT_TEAM_ROOT = path.join(os.homedir(), ".skillgate-team");

const args = process.argv.slice(2);
const wantDesktop = args.includes("--desktop");
const skipApply = args.includes("--skip-apply");
const langZh = !args.includes("--en");

const t = langZh
  ? {
      step: (n, total, msg) => console.log(`\n[${n}/${total}] ${msg}`),
      ok: (msg) => console.log(`✓ ${msg}`),
      fail: (msg) => {
        console.error(`\n✗ ${msg}`);
        process.exit(1);
      },
      warn: (msg) => console.warn(`! ${msg}`),
      title: "Skillgate Team — 一键安装",
      needGit: "需要 Git。安装：https://git-scm.com/downloads",
      needBun:
        "需要 Bun。Windows 一条命令：powershell -c \"irm bun.sh/install.ps1 | iex\"\n  或见 https://bun.sh",
      needNode:
        "需要 Node 22–25（桌面版 / SQLite）。下载：https://nodejs.org （选 22 LTS）",
      nodeBad: (v) =>
        `当前 Node ${v} 不在 22–25，桌面版可能失败；CLI 仍可尝试继续。`,
      done: "安装完成",
      next:
        "新开一个终端，然后运行：\n  skillgate doctor --profile quant\n可选：skillgate gui 或 skillgate tui",
      desktopSkip: "跳过桌面依赖（未加 --desktop）",
      desktopWinOnly: "--desktop 仅支持 Windows",
      applySkip: "跳过 apply（--skip-apply）",
    }
  : {
      step: (n, total, msg) => console.log(`\n[${n}/${total}] ${msg}`),
      ok: (msg) => console.log(`OK ${msg}`),
      fail: (msg) => {
        console.error(`\nFAIL ${msg}`);
        process.exit(1);
      },
      warn: (msg) => console.warn(`WARN ${msg}`),
      title: "Skillgate Team — bootstrap",
      needGit: "Git required: https://git-scm.com/downloads",
      needBun: "Bun required: https://bun.sh",
      needNode: "Node 22–25 required for desktop: https://nodejs.org",
      nodeBad: (v) => `Node ${v} is outside 22–25; desktop may fail.`,
      done: "Bootstrap complete",
      next:
        "Open a new terminal, then:\n  skillgate doctor --profile quant\nOptional: skillgate gui or skillgate tui",
      desktopSkip: "Skipping desktop deps (no --desktop)",
      desktopWinOnly: "--desktop is Windows-only",
      applySkip: "Skipping apply (--skip-apply)",
    };

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...opts.env },
    shell: true,
  });
}

function tryRun(cmd) {
  try {
    execSync(cmd, { stdio: "pipe", shell: true });
    return true;
  } catch {
    return false;
  }
}

function parseNodeMajor() {
  try {
    const v = execSync("node -v", { encoding: "utf-8" }).trim();
    const m = v.match(/^v(\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

function setUserEnv(name, value) {
  if (process.platform === "win32") {
    const escaped = value.replace(/'/g, "''");
    run(
      `powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('${name}','${escaped}','User')"`,
      { env: {} },
    );
    return;
  }
  const profile = fs.existsSync(path.join(os.homedir(), ".zshrc"))
    ? path.join(os.homedir(), ".zshrc")
    : path.join(os.homedir(), ".bashrc");
  const marker = `# skillgate ${name}`;
  const existing = fs.existsSync(profile)
    ? fs.readFileSync(profile, "utf-8")
    : "";
  if (existing.includes(marker)) return;
  const line =
    name === "SKILLGATE_ROOT"
      ? `export SKILLGATE_ROOT="${value.replace(/"/g, '\\"')}"`
      : `export ${name}="${value.replace(/"/g, '\\"')}"`;
  fs.appendFileSync(profile, `\n${marker}\n${line}\n`);
}

console.log(`\n=== ${t.title} ===`);
console.log(`Repo: ${ROOT}`);

const totalSteps = wantDesktop && process.platform === "win32" ? 6 : 5;
let step = 0;

t.step(++step, totalSteps, langZh ? "检查 Git / Bun / Node" : "Check Git / Bun / Node");
if (!tryRun("git --version")) t.fail(t.needGit);
if (!tryRun("bun --version")) t.fail(t.needBun);
const nodeMajor = parseNodeMajor();
if (nodeMajor === null) t.fail(t.needNode);
if (nodeMajor < 22 || nodeMajor > 25) t.warn(t.nodeBad(`v${nodeMajor}`));

t.step(++step, totalSteps, langZh ? "安装依赖" : "Install dependencies");
run("bun install --ignore-scripts");

t.step(++step, totalSteps, langZh ? "编译 CLI" : "Build CLI");
run("bun run build");

t.step(++step, totalSteps, langZh ? "安装全局 skillgate 命令" : "Install global skillgate");
run("bun run install-global");

const teamRoot = fs.existsSync(path.join(ROOT, "profiles"))
  ? ROOT
  : DEFAULT_TEAM_ROOT;
setUserEnv("SKILLGATE_ROOT", teamRoot);
process.env.SKILLGATE_ROOT = teamRoot;
t.ok(`SKILLGATE_ROOT → ${teamRoot}`);

if (wantDesktop) {
  t.step(++step, totalSteps, langZh ? "安装桌面版依赖" : "Install desktop deps");
  if (process.platform !== "win32") {
    t.warn(t.desktopWinOnly);
  } else {
    const ps1 = path.join(ROOT, "scripts", "install-gui.ps1");
    const r = spawnSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
      { cwd: ROOT, stdio: "inherit" },
    );
    if (r.status !== 0) {
      t.warn(
        langZh
          ? "桌面依赖安装失败；你仍可用 CLI / TUI。"
          : "Desktop deps failed; CLI / TUI still available.",
      );
    }
  }
} else {
  t.ok(t.desktopSkip);
}

if (!skipApply) {
  t.step(++step, totalSteps, langZh ? "应用 quant profile" : "Apply quant profile");
  const shim = path.join(os.homedir(), ".skillgate", "bin", "skillgate.mjs");
  const cli = fs.existsSync(shim)
    ? shim
    : path.join(ROOT, "cli", "bin", "skillgate.mjs");
  run(`node "${cli}" apply --profile quant -y`, {
    env: { SKILLGATE_ROOT: teamRoot },
  });
} else {
  t.ok(t.applySkip);
}

console.log(`\n=== ${t.done} ===`);
console.log(t.next);
console.log(
  langZh
    ? `\n团队目录：${teamRoot}\n文档：docs/GETTING_STARTED.md`
    : `\nTeam root: ${teamRoot}\nDocs: docs/GETTING_STARTED.en.md`,
);