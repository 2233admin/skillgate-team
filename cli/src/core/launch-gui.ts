import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import { cliPackageRoot } from "./cli-package-root.js";
import { getTeamSkillsRoot } from "./team-config.js";

export function desktopBinaryCandidates(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home = os.homedir(),
): string[] {
  const override = env.SKILLGATE_DESKTOP_BIN ? [env.SKILLGATE_DESKTOP_BIN] : [];
  if (platform === "win32") {
    const local = env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    const programFiles = env.PROGRAMFILES ?? "C:\\Program Files";
    return [
      ...override,
      path.join(local, "Skillgate", "Skillgate.exe"),
      path.join(local, "Programs", "Skillgate", "Skillgate.exe"),
      path.join(programFiles, "Skillgate", "Skillgate.exe"),
    ];
  }
  if (platform === "darwin") {
    return [
      ...override,
      "/Applications/Skillgate.app/Contents/MacOS/skillgate-desktop",
      path.join(home, "Applications", "Skillgate.app", "Contents", "MacOS", "skillgate-desktop"),
    ];
  }
  return [
    ...override,
    "/usr/bin/skillgate-desktop",
    "/usr/local/bin/skillgate-desktop",
    path.join(home, ".local", "bin", "skillgate-desktop"),
  ];
}

export function findInstalledDesktop(candidates = desktopBinaryCandidates()): string | null {
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function resolveTauriWorkspace(): string | null {
  const teamRoot = getTeamSkillsRoot();
  const candidates = [
    teamRoot,
    path.dirname(cliPackageRoot()),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".."),
  ];
  return candidates.find((root) => fs.existsSync(path.join(root, "desktop-tauri", "src-tauri", "tauri.conf.json"))) ?? null;
}

function commandExists(command: string): boolean {
  const lookup = process.platform === "win32" ? "where" : "which";
  return spawnSync(lookup, [command], { stdio: "ignore" }).status === 0;
}

function launchDetached(command: string, args: string[], cwd?: string): void {
  const child = spawn(command, args, { cwd, detached: true, stdio: "ignore" });
  child.once("error", (error) => {
    console.error(pc.red(`Could not launch Skillgate Desktop: ${error.message}`));
  });
  child.unref();
}

export function launchGui(args: string[] = []): void {
  const installed = findInstalledDesktop();
  if (installed) {
    launchDetached(installed, args);
    console.log(pc.green("Skillgate Desktop launched."));
    return;
  }

  const workspace = resolveTauriWorkspace();
  if (workspace && commandExists("bun")) {
    console.log(pc.yellow("Packaged Skillgate Desktop was not found; starting the Tauri development build."));
    const bun = process.platform === "win32" ? "bun.exe" : "bun";
    launchDetached(bun, ["run", "gui:tauri", "--", ...args], workspace);
    return;
  }

  console.error(pc.red("Skillgate Desktop is not installed."));
  console.error("Download the installer from https://github.com/2233admin/skillgate-team/releases");
  console.error(pc.dim("Developers can set SKILLGATE_DESKTOP_BIN or run `bun run gui` from the repository."));
  process.exitCode = 1;
}
