import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { getProfilePath } from "./team-config.js";
import type { AgentType } from "../types.js";

export interface TeamProfile {
  name: string;
  description?: string;
  skills: string[];
  agents?: AgentType[];
}

export async function readTeamProfile(
  profileName: string,
  teamRoot?: string,
): Promise<TeamProfile> {
  const profilePath = getProfilePath(profileName, teamRoot);
  const profilesDir = path.dirname(profilePath);
  let raw: string;
  try {
    raw = await fs.readFile(profilePath, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        `Profile "${profileName}" not found in ${profilesDir}. Run skillgate doctor or check profiles/.`,
      );
    }
    throw err;
  }
  const data = parseYaml(raw) as TeamProfile;
  if (!data?.skills?.length) {
    throw new Error(`Profile ${profileName} has no skills listed`);
  }
  return {
    name: data.name ?? profileName,
    description: data.description,
    skills: data.skills,
    agents: data.agents,
  };
}