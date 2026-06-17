#!/usr/bin/env node
/**
 * Clone skillgate-team (if missing) then run bootstrap.mjs.
 * Usage: node scripts/setup.mjs [--desktop]
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_URL = "https://github.com/2233admin/skillgate-team.git";
const TARGET = path.join(os.homedir(), ".skillgate-team");
const args = process.argv.slice(2);
const langZh = !args.includes("--en");

const msg = langZh
  ? {
      title: "Skillgate Team — 从零安装",
      clone: (p) => `克隆到 ${p}`,
      exists: (p) => `已存在 ${p}，跳过 clone`,
      needBun:
        "先安装 Bun：powershell -c \"irm bun.sh/install.ps1 | iex\"  或 https://bun.sh",
      needGit: "需要 Git：https://git-scm.com/downloads",
    }
  : {
      title: "Skillgate Team — setup from scratch",
      clone: (p) => `Cloning to ${p}`,
      exists: (p) => `Already at ${p}, skipping clone`,
      needBun: "Install Bun first: https://bun.sh",
      needGit: "Git required: https://git-scm.com/downloads",
    };

function has(cmd) {
  try {
    execSync(cmd, { stdio: "pipe", shell: true });
    return true;
  } catch {
    return false;
  }
}

console.log(`\n=== ${msg.title} ===\n`);

if (!has("git --version")) {
  console.error(msg.needGit);
  process.exit(1);
}
if (!has("bun --version")) {
  console.error(msg.needBun);
  process.exit(1);
}

if (!fs.existsSync(path.join(TARGET, ".git"))) {
  console.log(msg.clone(TARGET));
  execSync(`git clone ${REPO_URL} "${TARGET}"`, { stdio: "inherit", shell: true });
} else {
  console.log(msg.exists(TARGET));
}

const bootstrap = path.join(TARGET, "scripts", "bootstrap.mjs");
const forward = args.filter((a) => a !== "--en");
const r = spawnSync(process.execPath, [bootstrap, ...forward], {
  cwd: TARGET,
  stdio: "inherit",
});
process.exit(r.status ?? 1);