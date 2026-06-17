import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import { cliPackageRoot } from "./cli-package-root.js";
import { getTeamSkillsRoot } from "./team-config.js";

function resolveDesktopRoot(): string | null {
  const teamRoot = getTeamSkillsRoot();
  const candidates = [
    path.join(teamRoot, "desktop"),
    path.join(path.dirname(cliPackageRoot()), "desktop"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "desktop"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "electron-vite.config.ts"))) {
      return dir;
    }
  }
  return null;
}

function commandExists(cmd: string): boolean {
  try {
    const which = process.platform === "win32" ? "where" : "which";
    const result = spawnSync(which, [cmd], { encoding: "utf-8" });
    return result.status === 0;
  } catch {
    return false;
  }
}

function resolveElectronBinary(teamRoot: string): string | null {
  const candidates = [
    path.join(teamRoot, "node_modules", "electron", "dist", "electron.exe"),
    path.join(teamRoot, "node_modules", "electron", "dist", "electron"),
    path.join(teamRoot, "desktop", "node_modules", "electron", "dist", "electron.exe"),
    path.join(teamRoot, "desktop", "node_modules", "electron", "dist", "electron"),
  ];
  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

function launchDev(desktopRoot: string, args: string[]): void {
  const teamRoot = getTeamSkillsRoot();
  if (!resolveElectronBinary(teamRoot)) {
    console.error(pc.yellow("Electron binary not found."));
    console.error(
      `Run: cd ${teamRoot} && npm install && node node_modules/electron/install.js`,
    );
    console.error(
      pc.dim(
        "Tip: use Node 22 LTS (better-sqlite3 does not support Node 26 yet).",
      ),
    );
  }

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const script = args.includes("--preview") ? "preview" : "dev";
  const result = spawnSync(npmCmd, ["run", script], {
    cwd: desktopRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      SKILLGATE_ROOT: getTeamSkillsRoot(),
    },
  });
  process.exit(result.status ?? 1);
}

export function launchGui(args: string[] = []): void {
  const desktopRoot = resolveDesktopRoot();
  if (!desktopRoot) {
    console.error(pc.red("Desktop GUI not available."));
    console.error(
      "Clone skillgate-team with desktop/ and ui/ packages, then run: npm install && skillgate gui",
    );
    process.exit(1);
  }

  const nodeModules = path.join(desktopRoot, "node_modules");
  const rootNodeModules = path.join(getTeamSkillsRoot(), "node_modules");
  if (!fs.existsSync(nodeModules) && !fs.existsSync(rootNodeModules)) {
    console.error(
      pc.yellow(
        `Desktop dependencies missing. Run: cd ${getTeamSkillsRoot()} && npm install`,
      ),
    );
  }

  if (!commandExists("npm")) {
    console.error(pc.red("npm not found. Install Node.js/npm to run the desktop GUI."));
    process.exit(1);
  }

  launchDev(desktopRoot, args);
}