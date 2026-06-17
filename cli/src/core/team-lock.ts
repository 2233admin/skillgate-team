import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { getTeamLockPath } from "./team-config.js";

export type TeamSkillSource = "vendored" | "github";

export interface TeamSkillLockEntry {
  source: TeamSkillSource;
  path?: string;
  repo?: string;
  ref?: string;
  subpath?: string;
  contentHash: string;
}

export interface TeamLockFile {
  version: number;
  revision: number;
  skills: Record<string, TeamSkillLockEntry>;
}

export async function readTeamLock(
  root?: string,
): Promise<TeamLockFile> {
  const lockPath = getTeamLockPath(root);
  try {
    const raw = await fs.readFile(lockPath, "utf-8");
    const data = parseYaml(raw) as TeamLockFile;
    if (!data || data.version !== 1 || !data.skills) {
      throw new Error(`Invalid team lock format at ${lockPath}`);
    }
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot read team lock: ${message}`);
  }
}

export async function writeTeamLock(
  lock: TeamLockFile,
  root?: string,
): Promise<void> {
  const lockPath = getTeamLockPath(root);
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  await fs.writeFile(lockPath, stringifyYaml(lock), "utf-8");
}

export function resolveVendoredSkillDir(
  entry: TeamSkillLockEntry,
  teamRoot: string,
): string {
  if (entry.source !== "vendored" || !entry.path) {
    throw new Error("Skill entry is not vendored");
  }
  return path.join(teamRoot, entry.path);
}