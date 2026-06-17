import fs from "node:fs/promises";
import path from "node:path";
import simpleGit from "simple-git";
import {
  getSkillgateStateDir,
  getTeamVersionPath,
} from "../core/team-config.js";
import type {
  CatalogDriftOptions,
  CatalogDriftResult,
  TeamContext,
} from "./types.js";
import { ok, type Result } from "./types.js";

export const CATALOG_DRIFT_THROTTLE_SEC = 6 * 60 * 60;

async function readText(file: string): Promise<string | null> {
  try {
    return (await fs.readFile(file, "utf-8")).trim();
  } catch {
    return null;
  }
}

export async function checkCatalogDrift(
  ctx: TeamContext,
  options: CatalogDriftOptions = {},
): Promise<Result<CatalogDriftResult>> {
  const force = options.force ?? false;
  const stateDir = options.stateDir ?? getSkillgateStateDir();
  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);
  const cacheFile = path.join(stateDir, "last-update-check");
  const snoozeFile = path.join(stateDir, "update-snoozed");
  const versionFile = getTeamVersionPath(ctx.teamRoot);

  if (force) {
    await fs.rm(cacheFile, { force: true });
    await fs.rm(snoozeFile, { force: true });
  }

  if (!force) {
    const last = Number(await readText(cacheFile)) || 0;
    if (nowSec - last < CATALOG_DRIFT_THROTTLE_SEC) {
      return ok({
        status: "unknown",
        fromCache: true,
        message: "Skipped: within throttle window",
      });
    }
  }

  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(cacheFile, String(nowSec), "utf-8");

  const localVer = await readText(versionFile);
  if (!localVer) {
    return ok({
      status: "unknown",
      fromCache: false,
      message: "No local VERSION file",
    });
  }

  const remoteUrl = process.env.SKILLGATE_TEAM_REMOTE_URL?.trim();
  const remoteRepo = process.env.SKILLGATE_TEAM_REMOTE_REPO?.trim();

  if (remoteUrl) {
    try {
      const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(5000) });
      const remoteVer = (await res.text()).trim();
      if (remoteVer && remoteVer !== localVer) {
        return ok({
          status: "behind",
          fromCache: false,
          localVersion: localVer,
          remoteVersion: remoteVer,
        });
      }
      return ok({
        status: "ok",
        fromCache: false,
        localVersion: localVer,
        remoteVersion: remoteVer || localVer,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const isTimeout =
        message.includes("timeout") || message.includes("aborted");
      return {
        ok: false,
        error: {
          code: isTimeout ? "NETWORK_TIMEOUT" : "UNKNOWN",
          message: `Remote version check failed: ${message}`,
        },
      };
    }
  }

  if (remoteRepo) {
    try {
      const git = simpleGit();
      const ls = await git.listRemote([remoteRepo, "HEAD"]);
      const remoteHash = ls.trim().split(/\s+/)[0]?.slice(0, 8);
      const localGit = simpleGit(ctx.teamRoot);
      const localHash = (await localGit.revparse(["HEAD"])).trim().slice(0, 8);
      if (remoteHash && localHash && remoteHash !== localHash) {
        return ok({
          status: "behind",
          fromCache: false,
          localVersion: localHash,
          remoteVersion: remoteHash,
        });
      }
      return ok({
        status: "ok",
        fromCache: false,
        localVersion: localHash,
        remoteVersion: remoteHash || localHash,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return {
        ok: false,
        error: {
          code: "UNKNOWN",
          message: `Remote git check failed: ${message}`,
        },
      };
    }
  }

  return ok({
    status: "unknown",
    fromCache: false,
    localVersion: localVer,
    message: "No remote configured (SKILLGATE_TEAM_REMOTE_URL or SKILLGATE_TEAM_REMOTE_REPO)",
  });
}