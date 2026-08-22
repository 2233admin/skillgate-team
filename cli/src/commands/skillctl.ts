import pc from "picocolors";
import {
  collectLifecycleDoctor,
  collectLifecycleProfile,
  collectLifecycleSnapshot,
  renderLifecycleIndex,
  renderLifecycleJson,
} from "../core/lifecycle.js";

export function doctorExitCode(issueCount: number): number {
  return issueCount > 0 ? 1 : 0;
}

export async function runSkillctl(args: string[]): Promise<void> {
  const subcommand = args[0] ?? "status";
  const json = args.includes("--json");
  if (subcommand === "--help" || subcommand === "-h") {
    console.log("Usage: skillctl <inventory|status|doctor|profile|index|budget|update-check> [--json]");
    return;
  }
  const snapshot = await collectLifecycleSnapshot();

  if (subcommand === "inventory" || subcommand === "status") {
    if (json) {
      console.log(renderLifecycleJson(snapshot));
      return;
    }
    console.log(`Skill lifecycle status (${snapshot.generatedAt})`);
    console.log(`  Total: ${snapshot.summary.total}`);
    console.log(`  Hot:   ${pc.green(String(snapshot.summary.hot))}`);
    console.log(`  Warm:  ${pc.yellow(String(snapshot.summary.warm))}`);
    console.log(`  Cold:  ${pc.dim(String(snapshot.summary.cold))}`);
    console.log(`  Broken: ${snapshot.summary.broken}`);
    console.log(`  Estimated metadata tokens: ${snapshot.summary.estimatedTokens}`);
    if (subcommand === "inventory") {
      for (const skill of snapshot.skills) {
        console.log(`  ${skill.state.toUpperCase().padEnd(4)} ${skill.name} (${skill.usage.count} uses)`);
      }
    }
    return;
  }

  if (subcommand === "doctor") {
    const issues = await collectLifecycleDoctor(snapshot);
    const warnings = snapshot.skills.flatMap((skill) =>
      skill.warnings.map((warning) => `${skill.name}: ${warning}`),
    );
    if (json) {
      console.log(JSON.stringify({ ok: issues.length === 0, issues, warnings }, null, 2));
      process.exitCode = doctorExitCode(issues.length);
      return;
    }
    if (issues.length === 0 && warnings.length === 0) {
      console.log(pc.green("Skill lifecycle doctor: no issues found"));
      return;
    }
    console.log(pc.yellow(`Skill lifecycle doctor: ${issues.length} issue(s), ${warnings.length} warning(s)`));
    for (const issue of issues) console.log(`  issue: ${issue}`);
    for (const warning of warnings.slice(0, 20)) console.log(`  warning: ${warning}`);
    process.exitCode = doctorExitCode(issues.length);
    return;
  }

  if (subcommand === "profile") {
    console.log(json ? JSON.stringify(snapshot, null, 2) : await collectLifecycleProfile(snapshot));
    return;
  }

  if (subcommand === "index") {
    console.log(renderLifecycleIndex(snapshot));
    return;
  }

  if (subcommand === "budget") {
    if (json) {
      console.log(JSON.stringify({ budget: snapshot.summary.estimatedTokens, skills: snapshot.skills }, null, 2));
      return;
    }
    console.log(`Estimated metadata budget: ${snapshot.summary.estimatedTokens} tokens`);
    for (const skill of snapshot.skills.slice(0, 20)) {
      console.log(`  ${String(skill.estimatedTokens).padStart(5)} ${skill.name}`);
    }
    return;
  }

  if (subcommand === "update-check") {
    console.log("Skill update-check is read-only in this prototype.");
    console.log("Use skillgate update-check for catalog/profile drift.");
    return;
  }

  console.error(pc.red(`Unknown skillctl command: ${subcommand}`));
  console.error("Usage: skillgate skillctl <inventory|status|doctor|profile|index|budget|update-check> [--json]");
  process.exitCode = 1;
}
    
