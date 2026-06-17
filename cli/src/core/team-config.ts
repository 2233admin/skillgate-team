import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PROJECT_PROFILE_DIR = ".skillgate";
const PROJECT_PROFILE_FILE = "profile";

export function getTeamSkillsRoot(): string {
  return (
    process.env.SKILLGATE_ROOT ??
    path.join(os.homedir(), ".skillgate-team")
  );
}

export function getSkillgateStateDir(): string {
  return (
    process.env.SKILLGATE_STATE_DIR ??
    path.join(os.homedir(), ".skillgate")
  );
}

export function getSkillgateStatePath(): string {
  return path.join(getSkillgateStateDir(), "state.json");
}

export function getTeamLockPath(root = getTeamSkillsRoot()): string {
  return path.join(root, "skills.lock.yaml");
}

export function getTeamProtectPath(root = getTeamSkillsRoot()): string {
  return path.join(root, "protect.yaml");
}

export function getTeamVersionPath(root = getTeamSkillsRoot()): string {
  return path.join(root, "VERSION");
}

export function getProfilePath(
  profileName: string,
  root = getTeamSkillsRoot(),
): string {
  return path.join(root, "profiles", `${profileName}.yaml`);
}

export async function readProjectProfile(
  cwd = process.cwd(),
): Promise<string | null> {
  const profilePath = path.join(cwd, PROJECT_PROFILE_DIR, PROJECT_PROFILE_FILE);
  try {
    const raw = (await fs.readFile(profilePath, "utf-8")).trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}