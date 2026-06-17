import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  resolveTeamContext,
  runApply as runApplyApi,
} from "../team-api/index.js";
import type { InstallMethod } from "../types.js";

interface ApplyCliOptions {
  profile?: string;
  upgrade: boolean;
  copy: boolean;
  agent?: string[];
  writeLock: boolean;
  yes: boolean;
}

function parseApplyOptions(args: string[]): ApplyCliOptions {
  const options: ApplyCliOptions = {
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

export async function runApply(args: string[]): Promise<void> {
  const options = parseApplyOptions(args);
  const ctxResult = await resolveTeamContext({
    profile: options.profile,
    cwd: process.cwd(),
  });

  if (!ctxResult.ok) {
    console.error(
      pc.red(
        ctxResult.error.code === "TEAM_ROOT_MISSING"
          ? `${ctxResult.error.message}\nClone skillgate-team and set SKILLGATE_ROOT if needed.`
          : ctxResult.error.message,
      ),
    );
    process.exit(1);
  }

  const ctx = ctxResult.data;
  const profileName = options.profile ?? ctx.effectiveProfile;

  if (!options.yes) {
    p.intro(pc.bold(`skillgate apply: profile ${profileName}`));
  }

  const method: InstallMethod = options.copy ? "copy" : "symlink";
  const result = await runApplyApi(ctx, {
    profile: options.profile,
    upgrade: options.upgrade,
    method,
    agents: options.agent,
    writeLock: options.writeLock,
  });

  if (!result.ok) {
    if (result.error.code === "NO_AGENTS") {
      if (!options.yes) {
        p.log.warn("No target agents detected.");
      } else {
        console.error(pc.red("No target agents detected."));
      }
      process.exit(1);
    }

    const partial = result.error.details as
      | { installed?: number; failed?: number; skipped?: string[] }
      | undefined;

    if (partial?.skipped?.length) {
      for (const skill of partial.skipped) {
        p.log.warn(`Skipping protected skill: ${skill}`);
      }
    }

    if (result.error.code === "APPLY_PARTIAL_FAIL" && partial) {
      const summary = pc.green(
        `Done. ${partial.installed ?? 0} installs, ${partial.failed ?? 0} failures.`,
      );
      if (options.yes) {
        console.log(summary);
      } else {
        p.outro(summary);
      }
      process.exit(1);
    }

    const message = result.error.message;
    console.error(pc.red(message));
    process.exit(1);
  }

  const { data } = result;
  for (const skill of data.skipped) {
    p.log.warn(`Skipping protected skill: ${skill}`);
  }

  for (const item of data.results.filter((r) => !r.success)) {
    p.log.error(
      `${item.skill} -> ${item.agent}: ${item.error ?? "failed"}`,
    );
  }

  if (data.lockUpdated) {
    p.log.success(`Updated ${ctx.teamRoot}/skills.lock.yaml`);
  }

  const summary = pc.green(
    `Done. ${data.installed} installs, ${data.failed} failures.`,
  );
  if (options.yes) {
    console.log(summary);
  } else {
    p.outro(summary);
  }
}