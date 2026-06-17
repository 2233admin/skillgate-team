import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cliPackageRoot } from "./cli-package-root.js";

const SHIM_MJS = `#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const shimDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(process.env.SKILLGATE_HOME ?? path.join(shimDir, ".."), "repo");
const cliPath = path.join(repoRoot, "dist", "cli.js");
await import(pathToFileURL(cliPath).href);
`;

const SHIM_BASH = `#!/usr/bin/env bash
set -euo pipefail
exec node "$(dirname "$0")/skillgate.mjs" "$@"
`;

export function defaultCliSourcePath(): string {
  return cliPackageRoot();
}

export async function installGlobal(options: {
  sourcePath: string;
  skipBuild: boolean;
}): Promise<{ stateDir: string; binDir: string; repoLink: string }> {
  const sourcePath = path.resolve(options.sourcePath);
  const pkg = path.join(sourcePath, "package.json");
  try {
    await fs.access(pkg);
  } catch {
    throw new Error(`Not a skillgate CLI directory: ${sourcePath}`);
  }

  if (!options.skipBuild) {
    console.log(`Building skillgate in ${sourcePath} ...`);
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const nodeModules = path.join(sourcePath, "node_modules");
    try {
      await fs.access(nodeModules);
    } catch {
      execSync(`${npm} install`, { cwd: sourcePath, stdio: "inherit" });
    }
    execSync(`${npm} run build`, { cwd: sourcePath, stdio: "inherit" });
  }

  const home = os.homedir();
  const stateDir = path.join(home, ".skillgate");
  const binDir = path.join(stateDir, "bin");
  const repoLink = path.join(stateDir, "repo");

  await fs.mkdir(binDir, { recursive: true });

  try {
    const stat = await fs.lstat(repoLink);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      await fs.rm(repoLink, { recursive: true, force: true });
    }
  } catch {
    // absent
  }

  const linkType = process.platform === "win32" ? "junction" : "dir";
  await fs.symlink(sourcePath, repoLink, linkType);

  const shimMjs = path.join(binDir, "skillgate.mjs");
  const shimBash = path.join(binDir, "skillgate");
  await fs.writeFile(shimMjs, SHIM_MJS, "utf-8");
  await fs.writeFile(shimBash, SHIM_BASH, "utf-8");
  if (process.platform !== "win32") {
    await fs.chmod(shimBash, 0o755);
    await fs.chmod(shimMjs, 0o755);
  }

  await configureShellEnv({ stateDir, binDir, repoLink });

  return { stateDir, binDir, repoLink };
}

async function configureShellEnv(opts: {
  stateDir: string;
  binDir: string;
  repoLink: string;
}): Promise<void> {
  const { stateDir, binDir, repoLink } = opts;
  const cliPath = path.join(repoLink, "bin", "skillgate.mjs");
  process.env.SKILLGATE_HOME = stateDir;
  process.env.SKILLGATE_CLI = cliPath;
  const pathSep = process.platform === "win32" ? ";" : ":";
  if (!process.env.PATH?.split(pathSep).includes(binDir)) {
    process.env.PATH = `${binDir}${pathSep}${process.env.PATH ?? ""}`;
  }

  if (process.platform === "win32") {
    const escaped = (s: string) => s.replace(/'/g, "''");
    const ps = [
      `[Environment]::SetEnvironmentVariable('SKILLGATE_HOME','${escaped(stateDir)}','User')`,
      `[Environment]::SetEnvironmentVariable('SKILLGATE_CLI','${escaped(cliPath)}','User')`,
      `$p=[Environment]::GetEnvironmentVariable('Path','User')`,
      `if ($p -notlike '*${escaped(binDir)}*') { [Environment]::SetEnvironmentVariable('Path','${escaped(binDir)};' + $p,'User') }`,
    ].join("; ");
    execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: "ignore" });
    return;
  }

  const home = os.homedir();
  const profile =
    (await fileExists(path.join(home, ".zshrc"))) ? path.join(home, ".zshrc")
    : path.join(home, ".bashrc");
  const marker = "# skillgate PATH";
  let existing = "";
  try {
    existing = await fs.readFile(profile, "utf-8");
  } catch {
    existing = "";
  }
  if (existing.includes(marker)) {
    return;
  }
  const block = [
    "",
    marker,
    `export SKILLGATE_HOME="${stateDir}"`,
    `export SKILLGATE_CLI="${cliPath}"`,
    `export PATH="${binDir}:$PATH"`,
    "",
  ].join("\n");
  await fs.appendFile(profile, block, "utf-8");
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}