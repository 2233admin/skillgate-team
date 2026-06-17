import fs from "node:fs/promises";
import path from "node:path";
import { detectInstalledAgents } from "../core/agents.js";
import { hashDirectory } from "../core/content-hash.js";
import { installSkillForAgent } from "../core/installer.js";
import { readProtectList } from "../core/protect.js";
import { readTeamProfile } from "../core/profiles.js";
import {
  readTeamLock,
  resolveVendoredSkillDir,
  writeTeamLock,
} from "../core/team-lock.js";
import { getSkillgateStatePath } from "../core/team-config.js";
import { discoverSkills } from "../core/skill-discovery.js";
import type { AgentConfig, InstallMethod } from "../types.js";
import type {
  ApplyOptions,
  ApplyResult,
  ApplySkillResult,
  TeamContext,
} from "./types.js";
import { err, ok, type Result } from "./types.js";

async function saveApplyState(payload: Record<string, unknown>): Promise<void> {
  const statePath = getSkillgateStatePath();
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(payload, null, 2), "utf-8");
}

export async function runApply(
  ctx: TeamContext,
  options: ApplyOptions = {},
): Promise<Result<ApplyResult>> {
  const profileName = options.profile ?? ctx.effectiveProfile;
  const method: InstallMethod =
    options.method ?? (process.platform === "win32" ? "copy" : "symlink");
  const writeLock = options.writeLock ?? false;
  const dryRun = options.dryRun ?? false;

  let lock;
  let profile;
  try {
    lock = await readTeamLock(ctx.teamRoot);
    profile = await readTeamProfile(profileName, ctx.teamRoot);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (message.includes("not found") || message.includes("no skills")) {
      return err("PROFILE_NOT_FOUND", message, { profile: profileName });
    }
    return err("UNKNOWN", message);
  }

  const protect = await readProtectList(ctx.teamRoot);

  const detected = await detectInstalledAgents();
  let targetAgents = detected.filter((a) => a.name !== "universal");
  if (profile.agents?.length) {
    const allowed = new Set(profile.agents);
    targetAgents = targetAgents.filter((a) => allowed.has(a.name));
  }
  if (options.agents?.length) {
    const allowed = new Set(options.agents);
    targetAgents = targetAgents.filter((a) => allowed.has(a.name));
  }

  if (targetAgents.length === 0) {
    return err("NO_AGENTS", "No target agents detected.", {
      profile: profileName,
    });
  }

  let installed = 0;
  let failed = 0;
  const skipped: string[] = [];
  const results: ApplySkillResult[] = [];

  for (const skillName of profile.skills) {
    if (protect.has(skillName.toLowerCase())) {
      skipped.push(skillName);
      continue;
    }

    const entry = lock.skills[skillName];
    if (!entry) {
      failed++;
      results.push({
        skill: skillName,
        agent: "*",
        success: false,
        error: "No lock entry",
      });
      continue;
    }

    if (entry.source !== "vendored") {
      failed++;
      results.push({
        skill: skillName,
        agent: "*",
        success: false,
        error: `Unsupported source: ${entry.source} (MVP: vendored only)`,
      });
      continue;
    }

    const skillDir = resolveVendoredSkillDir(entry, ctx.teamRoot);
    const dirHash = await hashDirectory(skillDir);

    if (writeLock) {
      lock.skills[skillName] = { ...entry, contentHash: dirHash };
    }

    if (dryRun) {
      continue;
    }

    const skills = await discoverSkills(skillDir);
    if (skills.length === 0) {
      failed++;
      results.push({
        skill: skillName,
        agent: "*",
        success: false,
        error: `No SKILL.md in ${skillDir}`,
      });
      continue;
    }

    const skill = skills[0];
    for (const agent of targetAgents) {
      const result = await installSkillForAgent(
        skill,
        agent as AgentConfig,
        "global",
        method,
      );
      if (!result.success) {
        failed++;
        results.push({
          skill: skillName,
          agent: agent.name,
          success: false,
          error: result.error,
        });
      } else {
        installed++;
        results.push({
          skill: skillName,
          agent: agent.name,
          success: true,
        });
      }
    }
  }

  let lockUpdated = false;
  if (writeLock && !dryRun) {
    lock.revision = (lock.revision ?? 0) + 1;
    await writeTeamLock(lock, ctx.teamRoot);
    lockUpdated = true;
  }

  if (!dryRun) {
    await saveApplyState({
      appliedAt: new Date().toISOString(),
      profile: profileName,
      revision: lock.revision,
      teamRoot: ctx.teamRoot,
      method,
      agents: targetAgents.map((a) => a.name),
    });
  }

  const data: ApplyResult = {
    profile: profileName,
    installed,
    failed,
    skipped,
    method,
    agents: targetAgents.map((a) => a.name),
    results,
    lockUpdated,
  };

  if (failed > 0) {
    return err("APPLY_PARTIAL_FAIL", `${failed} install failure(s)`, data);
  }

  return ok(data);
}