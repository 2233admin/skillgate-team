import fs from "node:fs/promises";
import path from "node:path";
import { detectInstalledAgents } from "../core/agents.js";
import { hashDirectory } from "../core/content-hash.js";
import { sanitizeName } from "../core/installer.js";
import { readTeamProfile } from "../core/profiles.js";
import {
  readTeamLock,
  resolveVendoredSkillDir,
} from "../core/team-lock.js";
import type {
  DoctorOptions,
  DoctorResult,
  DriftItem,
  TeamContext,
} from "./types.js";
import { err, ok, type Result } from "./types.js";

export async function runDoctor(
  ctx: TeamContext,
  options: DoctorOptions = {},
): Promise<Result<DoctorResult>> {
  const profileName = options.profile ?? ctx.effectiveProfile;

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

  const drifts: DriftItem[] = [];
  let targetAgents = (await detectInstalledAgents()).filter(
    (a) => a.name !== "universal",
  );
  if (profile.agents?.length) {
    const allowed = new Set(profile.agents);
    targetAgents = targetAgents.filter((a) => allowed.has(a.name));
  }

  for (const skillName of profile.skills) {
    const entry = lock.skills[skillName];
    if (!entry) {
      drifts.push({ skill: skillName, kind: "lock_missing" });
      continue;
    }

    if (entry.source !== "vendored" || !entry.path) {
      drifts.push({ skill: skillName, kind: "source_missing" });
      continue;
    }

    const sourceDir = resolveVendoredSkillDir(entry, ctx.teamRoot);
    try {
      await fs.access(sourceDir);
    } catch {
      drifts.push({ skill: skillName, kind: "source_missing", path: sourceDir });
      continue;
    }

    const sourceHash = await hashDirectory(sourceDir);
    if (entry.contentHash && entry.contentHash !== sourceHash) {
      drifts.push({
        skill: skillName,
        kind: "hash_mismatch",
        expected: entry.contentHash,
        actual: sourceHash,
        path: sourceDir,
      });
    }

    const expected = entry.contentHash || sourceHash;
    if (targetAgents.length === 0) {
      drifts.push({
        skill: skillName,
        kind: "missing",
        expected,
      });
      continue;
    }

    for (const agent of targetAgents) {
      const installedDir = path.join(
        agent.globalSkillsDir,
        sanitizeName(skillName),
      );
      try {
        await fs.access(installedDir);
        const installedHash = await hashDirectory(installedDir);
        if (installedHash !== expected) {
          drifts.push({
            skill: skillName,
            kind: "hash_mismatch",
            expected,
            actual: installedHash,
            path: installedDir,
            agent: agent.name,
          });
        }
      } catch {
        drifts.push({
          skill: skillName,
          kind: "missing",
          path: installedDir,
          expected,
          agent: agent.name,
        });
      }
    }
  }

  return ok({
    ok: drifts.length === 0,
    profile: profileName,
    drifts,
    agentCount: targetAgents.length,
    teamRoot: ctx.teamRoot,
  });
}