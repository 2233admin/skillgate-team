import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  defaultCliSourcePath,
  installGlobal,
} from "../core/global-install.js";

function parseArgs(args: string[]): { sourcePath: string; skipBuild: boolean } {
  let sourcePath = defaultCliSourcePath();
  let skipBuild = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--source" && args[i + 1]) {
      sourcePath = args[++i];
    } else if (arg === "--skip-build") {
      skipBuild = true;
    }
  }
  return { sourcePath, skipBuild };
}

export async function runInstallGlobal(args: string[]): Promise<void> {
  const options = parseArgs(args);
  p.intro(pc.bold("skillgate install-global"));

  const result = await installGlobal(options);

  p.log.success(`Installed to ${result.stateDir}`);
  p.log.info(`repo → ${result.repoLink}`);
  p.log.info(`PATH += ${result.binDir}`);
  p.outro(
    pc.green("Open a new terminal, then: skillgate doctor --profile quant"),
  );
}