import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { detectInstalledAgents } from "../core/agents.js";
import { hashDirectory } from "../core/content-hash.js";
import { sanitizeName } from "../core/installer.js";
import { readTeamProfile } from "../core/profiles.js";
import {
  readTeamLock,
  resolveVendoredSkillDir,
} from "../core/team-lock.js";
import {
  getTeamSkillsRoot,
  readProjectProfile,
} from "../core/team-config.js";

interface DoctorOptions {
  profile?: string;
  quiet: boolean;
  json: boolean;
}

function parseDoctorOptions(args: string[]): DoctorOptions {
  const options: DoctorOptions = { quiet: false, json: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--profile" || arg === "-p") {
      options.profile = args[++i];
    } else if (arg === "-q" || arg === "--quiet") {
      options.quiet = true;
    } else if (arg === "--json") {
      options.json = true;
    }
  }
  return options;
}

interface DriftItem {
  skill: string;
  kind: "missing" | "hash_mismatch" | "lock_missing" | "source_missing";
  expected?: string;
  actual?: string;
  path?: string;
  agent?: string;
}

export async function runDoctor(args: string[]): Promise<void> {
  const options = parseDoctorOptions(args);
  const teamRoot = getTeamSkillsRoot();

  try {
    await fs.access(teamRoot);
  } catch {
    if (options.quiet) {
      console.error(
        `SKILLGATE_TEAM_MISSING: ${teamRoot} (clone skillgate-team or set SKILLGATE_ROOT)`,
      );
    } else {
      console.error(pc.red(`Team skills root not found: ${teamRoot}`));
    }
    process.exit(1);
  }

  const profileName =
    options.profile ?? (await readProjectProfile()) ?? "quant";
  const lock = await readTeamLock(teamRoot);
  const profile = await readTeamProfile(profileName, teamRoot);
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

    const sourceDir = resolveVendoredSkillDir(entry, teamRoot);
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

  const agentCount = targetAgents.length;

  if (options.json) {
    console.log(
      JSON.stringify(
        { ok: drifts.length === 0, profile: profileName, drifts, agentCount },
        null,
        2,
      ),
    );
  } else if (!options.quiet) {
    console.log(pc.bold(`skillgate doctor - profile ${profileName}`));
    console.log(pc.dim(`team root: ${teamRoot}`));
    console.log(pc.dim(`agents detected: ${agentCount}`));
    if (drifts.length === 0) {
      console.log(pc.green("OK - no drift detected."));
    } else {
      for (const d of drifts) {
        console.log(
          pc.red(
            `${d.skill}${d.agent ? `@${d.agent}` : ""}: ${d.kind}${d.expected ? ` (expected ${d.expected}, got ${d.actual ?? "n/a"})` : ""}`,
          ),
        );
      }
    }
  } else if (options.quiet && drifts.length > 0) {
    console.error(
      `SKILLGATE_DRIFT: ${drifts.length} issue(s) (run skillgate doctor --profile ${profileName} for details)`,
    );
  }

  process.exit(drifts.length === 0 ? 0 : 1);
}