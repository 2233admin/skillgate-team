import * as p from "@clack/prompts";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pc from "picocolors";
import { getTeamSkillsRoot, getSkillgateStateDir } from "../core/team-config.js";

export async function runSetupTeam(args: string[]): Promise<void> {
  let root = getTeamSkillsRoot();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && args[i + 1]) {
      root = path.resolve(args[++i]);
    }
  }

  p.intro(pc.bold("skillgate setup --team"));

  await fs.mkdir(getSkillgateStateDir(), { recursive: true });

  try {
    await fs.access(root);
    p.log.success(`Team skills root: ${root}`);
  } catch {
    p.log.warn(`Team skills root does not exist yet: ${root}`);
    p.log.info(
      `Clone skillgate-team:\n  git clone https://github.com/2233admin/skillgate-team.git ${root}`,
    );
  }

  const shell = process.env.SHELL ?? "";
  const profileHint =
    shell.includes("bash") || os.platform() !== "win32"
      ? `export SKILLGATE_ROOT="${root.replace(/\\/g, "/")}"`
      : `$env:SKILLGATE_ROOT = "${root}"`;

  const teamCliDir = path.join(root, "cli").replace(/\\/g, "/");

  p.note(
    [
      "Add to your shell profile:",
      profileHint,
      "",
      "Install CLI globally (from team repo):",
      `  cd ${teamCliDir} && npm install && npm run build`,
      "  node bin/skillgate.mjs install-global",
      "  Open a new terminal so PATH picks up skillgate.",
      "",
      "Then run:",
      "  skillgate apply --profile quant",
      "  skillgate doctor --profile quant",
      "",
      "For application repos:",
      "  skillgate team-init --mode required",
    ].join("\n"),
    "Next steps",
  );

  p.outro(pc.green("Team setup notes written."));
}