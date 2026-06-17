import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import simpleGit from "simple-git";
import {
  getSkillgateStateDir,
  getTeamSkillsRoot,
  getTeamVersionPath,
} from "../core/team-config.js";

const THROTTLE_SEC = 6 * 60 * 60;

function parseArgs(args: string[]): { force: boolean } {
  return { force: args.includes("--force") };
}

async function readText(file: string): Promise<string | null> {
  try {
    return (await fs.readFile(file, "utf-8")).trim();
  } catch {
    return null;
  }
}

export async function runUpdateCheck(args: string[]): Promise<void> {
  const { force } = parseArgs(args);
  const teamRoot = getTeamSkillsRoot();
  const stateDir = getSkillgateStateDir();
  const cacheFile = path.join(stateDir, "last-update-check");
  const snoozeFile = path.join(stateDir, "update-snoozed");
  const versionFile = getTeamVersionPath(teamRoot);

  if (force) {
    await fs.rm(cacheFile, { force: true });
    await fs.rm(snoozeFile, { force: true });
  }

  if (!force) {
    const last = Number(await readText(cacheFile)) || 0;
    if (Date.now() / 1000 - last < THROTTLE_SEC) {
      return;
    }
  }

  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(cacheFile, String(Math.floor(Date.now() / 1000)), "utf-8");

  const localVer = await readText(versionFile);
  if (!localVer) {
    return;
  }

  const remoteUrl = process.env.SKILLGATE_TEAM_REMOTE_URL?.trim();
  const remoteRepo = process.env.SKILLGATE_TEAM_REMOTE_REPO?.trim();

  if (remoteUrl) {
    try {
      const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(5000) });
      const remoteVer = (await res.text()).trim();
      if (remoteVer && remoteVer !== localVer) {
        console.log(`TEAM_CATALOG_UPGRADE ${localVer} ${remoteVer}`);
      }
    } catch {
      // skip
    }
    return;
  }

  if (remoteRepo) {
    try {
      const git = simpleGit();
      const ls = await git.listRemote([remoteRepo, "HEAD"]);
      const remoteHash = ls.trim().split(/\s+/)[0]?.slice(0, 8);
      const localGit = simpleGit(teamRoot);
      const localHash = (await localGit.revparse(["HEAD"])).trim().slice(0, 8);
      if (remoteHash && localHash && remoteHash !== localHash) {
        console.log(`TEAM_CATALOG_UPGRADE ${localHash} ${remoteHash}`);
      }
    } catch {
      // skip
    }
  }
}