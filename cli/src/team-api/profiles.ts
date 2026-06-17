import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { getProfilePath } from "../core/team-config.js";
import { readTeamProfile } from "../core/profiles.js";
import type { ProfileSummary, TeamContext } from "./types.js";
import { err, ok, type Result } from "./types.js";

export async function listProfiles(ctx: TeamContext): Promise<Result<string[]>> {
  const profilesDir = path.join(ctx.teamRoot, "profiles");
  try {
    const entries = await fs.readdir(profilesDir, { withFileTypes: true });
    const names = entries
      .filter((e) => e.isFile() && e.name.endsWith(".yaml"))
      .map((e) => e.name.replace(/\.yaml$/, ""))
      .sort();
    return ok(names);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err("UNKNOWN", `Cannot list profiles in ${profilesDir}: ${message}`);
  }
}

export async function getProfileSummary(
  ctx: TeamContext,
  name: string,
): Promise<Result<ProfileSummary>> {
  const profilePath = getProfilePath(name, ctx.teamRoot);
  try {
    const profile = await readTeamProfile(name, ctx.teamRoot);
    return ok({
      name: profile.name,
      description: profile.description,
      skillCount: profile.skills.length,
      agents: profile.agents,
    });
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return err(
        "PROFILE_NOT_FOUND",
        `Profile "${name}" not found in ${path.dirname(profilePath)}`,
        { profile: name },
      );
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    if (message.includes("not found") || message.includes("no skills")) {
      return err("PROFILE_NOT_FOUND", message, { profile: name });
    }
    return err("UNKNOWN", message);
  }
}

/** Read raw profile metadata without throwing (internal helper). */
export async function readProfileYaml(
  teamRoot: string,
  name: string,
): Promise<{ name: string; description?: string; skills: string[] } | null> {
  const profilePath = getProfilePath(name, teamRoot);
  try {
    const raw = await fs.readFile(profilePath, "utf-8");
    const data = parseYaml(raw) as {
      name?: string;
      description?: string;
      skills?: string[];
    };
    if (!data?.skills?.length) return null;
    return {
      name: data.name ?? name,
      description: data.description,
      skills: data.skills,
    };
  } catch {
    return null;
  }
}