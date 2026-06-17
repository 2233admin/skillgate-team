import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readProjectProfile } from "../core/team-config.js";
import type { ResolveTeamContextInput, TeamContext } from "./types.js";
import { err, ok, type Result } from "./types.js";

function defaultTeamRoot(): string {
  return (
    process.env.SKILLGATE_ROOT ?? path.join(os.homedir(), ".skillgate-team")
  );
}

export async function resolveTeamContext(
  input: ResolveTeamContextInput = {},
): Promise<Result<TeamContext>> {
  const teamRoot =
    input.teamRoot?.trim() ||
    input.settings?.["team.root"]?.trim() ||
    defaultTeamRoot();

  try {
    await fs.access(teamRoot);
  } catch {
    return err(
      "TEAM_ROOT_MISSING",
      `Team skills root not found: ${teamRoot}`,
      { teamRoot },
    );
  }

  const linkedProject =
    input.linkedProject?.trim() || input.settings?.["team.linkedProject"]?.trim();

  let effectiveProfile: string;
  let profileSource: TeamContext["profileSource"];

  if (input.profile?.trim()) {
    effectiveProfile = input.profile.trim();
    profileSource = "explicit";
  } else if (linkedProject) {
    const fromLinked = await readProjectProfile(linkedProject);
    if (fromLinked) {
      effectiveProfile = fromLinked;
      profileSource = "linked_project";
    } else if (input.settings?.["team.lastProfile"]?.trim()) {
      effectiveProfile = input.settings["team.lastProfile"].trim();
      profileSource = "settings";
    } else {
      effectiveProfile = "quant";
      profileSource = "default";
    }
  } else if (input.settings?.["team.lastProfile"]?.trim()) {
    effectiveProfile = input.settings["team.lastProfile"].trim();
    profileSource = "settings";
  } else if (input.cwd) {
    const fromCwd = await readProjectProfile(input.cwd);
    if (fromCwd) {
      effectiveProfile = fromCwd;
      profileSource = "cwd";
    } else {
      effectiveProfile = "quant";
      profileSource = "default";
    }
  } else {
    effectiveProfile = "quant";
    profileSource = "default";
  }

  return ok({
    teamRoot,
    linkedProject,
    effectiveProfile,
    profileSource,
  });
}