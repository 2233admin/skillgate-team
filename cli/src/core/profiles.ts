import fs from "node:fs/promises";
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
  const raw = await fs.readFile(profilePath, "utf-8");
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