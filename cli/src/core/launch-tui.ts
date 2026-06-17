import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import { cliPackageRoot } from "./cli-package-root.js";
import { getTeamSkillsRoot } from "./team-config.js";

const platformMap: Record<string, Record<string, string>> = {
  darwin: { arm64: "tui-darwin-arm64", x64: "tui-darwin-x64" },
  linux: { arm64: "tui-linux-arm64", x64: "tui-linux-x64" },
  win32: { x64: "tui-win32-x64" },
};

function resolveTuiSourceRoot(): string | null {
  const teamRoot = getTeamSkillsRoot();
  const candidates = [
    path.join(teamRoot, "tui"),
    path.join(path.dirname(cliPackageRoot()), "tui"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "tui"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "src", "index.tsx"))) {
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

function findPlatformBinary(): string | null {
  const platform = os.platform();
  const arch = os.arch();
  const pkg = platformMap[platform]?.[arch];
  if (!pkg) return null;

  const binName = platform === "win32" ? "skillsgate-tui.exe" : "skillsgate-tui";
  const require = createRequire(import.meta.url);
  const candidates = [
    () => require.resolve(`@skillsgate/${pkg}/${binName}`),
    () => {
      const globalRoot = execFileSync("npm", ["root", "-g"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      return path.join(globalRoot, `@skillsgate/${pkg}`, binName);
    },
  ];

  for (const resolve of candidates) {
    try {
      const p = resolve();
      fs.accessSync(p, fs.constants.R_OK);
      return p;
    } catch {
      continue;
    }
  }
  return null;
}

function launchWithBun(tuiRoot: string, args: string[]): void {
  const result = spawnSync("bun", ["run", "src/index.tsx", ...args], {
    cwd: tuiRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      SKILLGATE_ROOT: getTeamSkillsRoot(),
    },
  });
  process.exit(result.status ?? 1);
}

function launchWithBinary(binPath: string, args: string[]): void {
  execFileSync(binPath, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      SKILLGATE_ROOT: getTeamSkillsRoot(),
    },
  });
}

export function launchTui(args: string[] = []): void {
  const tuiRoot = resolveTuiSourceRoot();
  if (tuiRoot) {
    const nodeModules = path.join(tuiRoot, "node_modules");
    if (!fs.existsSync(nodeModules)) {
      console.error(
        pc.yellow(
          `TUI dependencies missing. Run: cd ${tuiRoot} && bun install`,
        ),
      );
    } else if (commandExists("bun")) {
      launchWithBun(tuiRoot, args);
      return;
    } else {
      console.error(
        pc.yellow("Bun not found. Install Bun or use the platform TUI binary."),
      );
    }
  }

  const binary = findPlatformBinary();
  if (binary) {
    launchWithBinary(binary, args);
    return;
  }

  const platform = os.platform();
  const arch = os.arch();
  const pkg = platformMap[platform]?.[arch] ?? "tui-<platform>";
  console.error(pc.red("TUI not available."));
  console.error(
    `Clone skillgate-team with the tui/ package and run: cd tui && bun install && bun run start`,
  );
  console.error(
    `Or install the platform binary: npm install -g @skillsgate/${pkg}`,
  );
  process.exit(1);
}