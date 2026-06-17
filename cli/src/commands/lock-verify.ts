import fs from "node:fs/promises";
import pc from "picocolors";
import { hashDirectory } from "../core/content-hash.js";
import {
  readTeamLock,
  resolveVendoredSkillDir,
  writeTeamLock,
} from "../core/team-lock.js";
import { getTeamSkillsRoot } from "../core/team-config.js";

export async function runLockVerify(args: string[]): Promise<void> {
  const write = args.includes("--write");
  const teamRoot = getTeamSkillsRoot();
  const lock = await readTeamLock(teamRoot);
  let mismatches = 0;

  for (const [name, entry] of Object.entries(lock.skills)) {
    if (entry.source !== "vendored") continue;
    const dir = resolveVendoredSkillDir(entry, teamRoot);
    const hash = await hashDirectory(dir);
    if (entry.contentHash !== hash) {
      mismatches++;
      console.error(
        pc.yellow(
          `${name}: lock ${entry.contentHash ?? "(empty)"} != disk ${hash}`,
        ),
      );
      if (write) {
        lock.skills[name] = { ...entry, contentHash: hash };
      }
    }
  }

  if (write && mismatches > 0) {
    lock.revision = (lock.revision ?? 0) + 1;
    await writeTeamLock(lock, teamRoot);
    console.log(pc.green(`Updated lock (${mismatches} entries).`));
    process.exit(0);
  }

  if (mismatches > 0) {
    console.error(pc.red(`${mismatches} hash mismatch(es). Run with --write to fix.`));
    process.exit(1);
  }

  console.log(pc.green("Lock verify OK."));
}