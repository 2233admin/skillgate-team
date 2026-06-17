import * as p from "@clack/prompts";
import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { detectInstalledAgents } from "../core/agents.js";
import { hashDirectory } from "../core/content-hash.js";
import { installSkillForAgent, sanitizeName } from "../core/installer.js";
import { readProtectList } from "../core/protect.js";
import { readTeamProfile } from "../core/profiles.js";
import {
  readTeamLock,
  resolveVendoredSkillDir,
  writeTeamLock,
} from "../core/team-lock.js";
import {
  getSkillgateStatePath,
  getTeamSkillsRoot,
  readProjectProfile,
} from "../core/team-config.js";
import { discoverSkills } from "../core/skill-discovery.js";
import type { AgentConfig, InstallMethod } from "../types.js";

interface ApplyOptions {
  profile?: string;
  upgrade: boolean;
  copy: boolean;
  agent?: string[];
  writeLock: boolean;
  yes: boolean;
}

function parseApplyOptions(args: string[]): ApplyOptions {
  const options: ApplyOptions = {
    upgrade: false,
    copy: process.platform === "win32",
    writeLock: false,
    yes: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--profile" || arg === "-p") {
      options.profile = args[++i];
    } else if (arg === "--upgrade") {
      options.upgrade = true;
    } else if (arg === "--copy") {
      options.copy = true;
    } else if (arg === "--symlink") {
      options.copy = false;
    } else if (arg === "--agent" || arg === "-a") {
      options.agent = options.agent ?? [];
      options.agent.push(args[++i]);
    } else if (arg === "--write-lock") {
      options.writeLock = true;
    } else if (arg === "-y" || arg === "--yes") {
      options.yes = true;
    }
  }
  return options;
}

async function saveApplyState(payload: Record<string, unknown>): Promise<void> {
  const statePath = getSkillgateStatePath();
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(payload, null, 2), "utf-8");
}

export async function runApply(args: string[]): Promise<void> {
  const options = parseApplyOptions(args);
  const teamRoot = getTeamSkillsRoot();

  try {
    await fs.access(teamRoot);
  } catch {
    console.error(
      pc.red(
        `Team skills root not found: ${teamRoot}\nClone team-skills and set SKILLGATE_ROOT if needed.`,
      ),
    );
    process.exit(1);
  }

  const profileName =
    options.profile ?? (await readProjectProfile()) ?? "quant";
  const lock = await readTeamLock(teamRoot);
  const profile = await readTeamProfile(profileName, teamRoot);
  const protect = await readProtectList(teamRoot);

  p.intro(pc.bold(`skillgate apply — profile ${profileName}`));

  const detected = await detectInstalledAgents();
  let targetAgents = detected.filter((a) => a.name !== "universal");
  if (profile.agents?.length) {
    const allowed = new Set(profile.agents);
    targetAgents = targetAgents.filter((a) => allowed.has(a.name));
  }
  if (options.agent?.length) {
    const allowed = new Set(options.agent);
    targetAgents = targetAgents.filter((a) => allowed.has(a.name));
  }

  if (targetAgents.length === 0) {
    p.log.warn("No target agents detected.");
    process.exit(1);
  }

  const method: InstallMethod = options.copy ? "copy" : "symlink";
  const spinner = p.spinner();
  let installed = 0;
  let failed = 0;

  for (const skillName of profile.skills) {
    if (protect.has(skillName.toLowerCase())) {
      p.log.warn(`Skipping protected skill: ${skillName}`);
      continue;
    }

    const entry = lock.skills[skillName];
    if (!entry) {
      p.log.warn(`No lock entry for skill: ${skillName}`);
      failed++;
      continue;
    }

    if (entry.source !== "vendored") {
      p.log.warn(`Unsupported source for ${skillName}: ${entry.source} (MVP: vendored only)`);
      failed++;
      continue;
    }

    const skillDir = resolveVendoredSkillDir(entry, teamRoot);
    const dirHash = await hashDirectory(skillDir);

    if (options.writeLock) {
      lock.skills[skillName] = { ...entry, contentHash: dirHash };
    } else if (entry.contentHash && entry.contentHash !== dirHash) {
      p.log.warn(
        `${skillName}: lock hash mismatch (expected ${entry.contentHash}, got ${dirHash})`,
      );
    }

    spinner.start(`Installing ${skillName}...`);
    const skills = await discoverSkills(skillDir);
    if (skills.length === 0) {
      spinner.stop(pc.red(`No SKILL.md in ${skillDir}`));
      failed++;
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
        p.log.error(`${skillName} → ${agent.displayName}: ${result.error}`);
      } else {
        installed++;
      }
    }
    spinner.stop(`${skillName} → ${targetAgents.length} agent(s)`);
  }

  if (options.writeLock) {
    lock.revision = (lock.revision ?? 0) + 1;
    await writeTeamLock(lock, teamRoot);
    p.log.success(`Updated ${getTeamSkillsRoot()}/skills.lock.yaml`);
  }

  await saveApplyState({
    appliedAt: new Date().toISOString(),
    profile: profileName,
    revision: lock.revision,
    teamRoot,
    method,
    agents: targetAgents.map((a) => a.name),
  });

  p.outro(
    pc.green(`Done. ${installed} installs, ${failed} failures.`),
  );

  if (failed > 0) {
    process.exit(1);
  }
}