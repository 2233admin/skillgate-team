import fs from "node:fs/promises";
import { getSkillgateStatePath } from "../core/team-config.js";
import type { LastApplyState } from "./types.js";
import { ok, type Result } from "./types.js";

export async function getLastApplyState(): Promise<Result<LastApplyState | null>> {
  const statePath = getSkillgateStatePath();
  try {
    const raw = await fs.readFile(statePath, "utf-8");
    const data = JSON.parse(raw) as LastApplyState;
    return ok(data);
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return ok(null);
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: { code: "UNKNOWN", message } };
  }
}