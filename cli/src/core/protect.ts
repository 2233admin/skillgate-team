import fs from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { getTeamProtectPath } from "./team-config.js";

export async function readProtectList(teamRoot?: string): Promise<Set<string>> {
  const protectPath = getTeamProtectPath(teamRoot);
  try {
    const raw = await fs.readFile(protectPath, "utf-8");
    const data = parseYaml(raw) as { skills?: string[] };
    return new Set((data.skills ?? []).map((s) => s.toLowerCase()));
  } catch {
    return new Set();
  }
}