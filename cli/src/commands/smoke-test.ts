import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pc from "picocolors";
import { cliEntryPath } from "../core/cli-package-root.js";
import { getTeamSkillsRoot } from "../core/team-config.js";

const LOGO_BLOCK = "███████╗";

function parseArgs(args: string[]): { profile: string; skipApply: boolean } {
  let profile = "quant";
  let skipApply = false;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--profile" || args[i] === "-p") && args[i + 1]) {
      profile = args[++i];
    } else if (args[i] === "--skip-apply") {
      skipApply = true;
    }
  }
  return { profile, skipApply };
}

function runCli(
  argv: string[],
  env: NodeJS.ProcessEnv,
): { code: number; stdout: string; stderr: string } {
  const entry = cliEntryPath(import.meta.url);
  const result = spawnSync(process.execPath, [entry, ...argv], {
    env: { ...process.env, ...env },
    encoding: "utf-8",
    cwd: path.dirname(entry),
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export async function runSmokeTest(args: string[]): Promise<void> {
  const { profile, skipApply } = parseArgs(args);
  const teamRoot = process.env.SKILLGATE_ROOT ?? getTeamSkillsRoot();
  const env = { SKILLGATE_ROOT: teamRoot };
  let failed = 0;

  console.log(pc.bold("=== smoke: lock verify ==="));
  const lock = runCli(["lock", "verify"], env);
  if (lock.code !== 0) {
    console.log(pc.red(`FAIL: lock verify exit ${lock.code}`));
    if (lock.stderr) console.log(lock.stderr.trim());
    failed++;
  }

  console.log(pc.bold("=== smoke: doctor -q (no logo) ==="));
  const doctor = runCli(["doctor", "--profile", profile, "-q"], env);
  const doctorOut = doctor.stdout + doctor.stderr;
  if (doctor.code !== 0) {
    console.log(pc.red(`FAIL: doctor -q exit ${doctor.code}`));
    failed++;
  } else if (doctorOut.includes(LOGO_BLOCK)) {
    console.log(pc.red("FAIL: doctor -q still printed logo"));
    failed++;
  }

  if (!skipApply) {
    console.log(pc.bold("=== smoke: apply -y ==="));
    const apply = runCli(["apply", "--profile", profile, "-y"], env);
    if (apply.code !== 0) {
      failed++;
    }
  }

  console.log(pc.bold("=== smoke: global shim ==="));
  const shim = path.join(os.homedir(), ".skillgate", "bin", "skillgate.mjs");
  const repoCli = path.join(os.homedir(), ".skillgate", "repo", "dist", "cli.js");
  try {
    await fs.access(shim);
    try {
      await fs.access(repoCli);
    } catch {
      console.log(
        pc.red(`FAIL: junction repo missing dist/cli.js at ${repoCli}`),
      );
      failed++;
    }
    const shimRun = spawnSync(
      process.execPath,
      [shim, "doctor", "--profile", profile, "-q"],
      { env: { ...process.env, SKILLGATE_ROOT: teamRoot }, encoding: "utf-8" },
    );
    if ((shimRun.status ?? 1) !== 0) {
      console.log(pc.red(`FAIL: global shim doctor exit ${shimRun.status}`));
      if (shimRun.stderr) console.log(shimRun.stderr.trim());
      failed++;
    }
  } catch {
    console.log(pc.dim(`SKIP: no global shim at ${shim}`));
  }

  if (failed > 0) {
    console.log(pc.red(`SMOKE FAILED: ${failed} check(s)`));
    process.exit(1);
  }
  console.log(pc.green("SMOKE OK"));
}