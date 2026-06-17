import { hashDirectory } from "../core/content-hash.js";
import {
  readTeamLock,
  resolveVendoredSkillDir,
  writeTeamLock,
} from "../core/team-lock.js";
import type {
  LockMismatch,
  LockVerifyOptions,
  LockVerifyResult,
  TeamContext,
} from "./types.js";
import { err, ok, type Result } from "./types.js";

export async function runLockVerify(
  ctx: TeamContext,
  options: LockVerifyOptions = {},
): Promise<Result<LockVerifyResult>> {
  const write = options.write ?? false;

  let lock;
  try {
    lock = await readTeamLock(ctx.teamRoot);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err("UNKNOWN", message);
  }

  const mismatches: LockMismatch[] = [];

  for (const [name, entry] of Object.entries(lock.skills)) {
    if (entry.source !== "vendored") continue;
    const dir = resolveVendoredSkillDir(entry, ctx.teamRoot);
    const hash = await hashDirectory(dir);
    if (entry.contentHash !== hash) {
      mismatches.push({
        skill: name,
        lockHash: entry.contentHash ?? null,
        diskHash: hash,
      });
      if (write) {
        lock.skills[name] = { ...entry, contentHash: hash };
      }
    }
  }

  let updated = false;
  if (write && mismatches.length > 0) {
    lock.revision = (lock.revision ?? 0) + 1;
    await writeTeamLock(lock, ctx.teamRoot);
    updated = true;
  }

  return ok({
    ok: mismatches.length === 0 || updated,
    mismatches,
    mismatchCount: mismatches.length,
    updated,
  });
}