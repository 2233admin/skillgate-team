import * as p from "@clack/prompts";
import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import simpleGit from "simple-git";
import { renderCheckSkillgateHook } from "../core/project-hook.js";

type InitMode = "optional" | "required";

function parseArgs(args: string[]): InitMode {
  let mode: InitMode = "optional";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--mode" && args[i + 1]) {
      const m = args[++i];
      if (m === "required" || m === "optional") {
        mode = m;
      }
    } else if (args[i] === "--required") {
      mode = "required";
    }
  }
  return mode;
}

async function gitRepoRoot(cwd: string): Promise<string> {
  const git = simpleGit(cwd);
  const root = await git.revparse(["--show-toplevel"]);
  return root.trim();
}

async function ensureProfile(repoRoot: string): Promise<void> {
  const dir = path.join(repoRoot, ".skillgate");
  const file = path.join(dir, "profile");
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, "quant", "utf-8");
  }
}

async function writeHook(repoRoot: string): Promise<string> {
  const hookDir = path.join(repoRoot, ".claude", "hooks");
  const hookFile = path.join(hookDir, "check-skillgate.sh");
  await fs.mkdir(hookDir, { recursive: true });
  await fs.writeFile(hookFile, renderCheckSkillgateHook(), "utf-8");
  if (process.platform !== "win32") {
    await fs.chmod(hookFile, 0o755);
  }
  return hookFile;
}

interface ClaudeSettings {
  hooks?: {
    SessionStart?: Array<{
      hooks?: Array<{ type?: string; command?: string }>;
    }>;
  };
}

async function registerSessionStartHook(repoRoot: string): Promise<void> {
  const settingsFile = path.join(repoRoot, ".claude", "settings.json");
  await fs.mkdir(path.dirname(settingsFile), { recursive: true });

  let settings: ClaudeSettings = {};
  try {
    const raw = await fs.readFile(settingsFile, "utf-8");
    settings = JSON.parse(raw) as ClaudeSettings;
  } catch {
    settings = {};
  }

  settings.hooks ??= {};
  settings.hooks.SessionStart ??= [];

  const hookCmd = '"$CLAUDE_PROJECT_DIR/.claude/hooks/check-skillgate.sh"';
  const exists = settings.hooks.SessionStart.some((entry) =>
    entry.hooks?.some((h) => h.command?.includes("check-skillgate")),
  );
  if (!exists) {
    settings.hooks.SessionStart.push({
      hooks: [{ type: "command", command: hookCmd }],
    });
  }

  await fs.writeFile(
    settingsFile,
    `${JSON.stringify(settings, null, 2)}\n`,
    "utf-8",
  );
}

function claudeMdSnippet(mode: InitMode): string {
  if (mode === "required") {
    return `

## skillgate (REQUIRED)

Before any work, verify team skills:

\`\`\`bash
skillgate doctor --profile quant
\`\`\`

If missing: clone skillgate-team to \`~/.skillgate-team\`, then \`skillgate apply --profile quant\`.
`;
  }
  return `

## skillgate (recommended)

Install team skills for consistent agent behavior:

\`\`\`bash
skillgate apply --profile quant
\`\`\`
`;
}

async function patchClaudeMd(repoRoot: string, mode: InitMode): Promise<void> {
  const claudeMd = path.join(repoRoot, "CLAUDE.md");
  const snippet = claudeMdSnippet(mode);
  let content = "";
  try {
    content = await fs.readFile(claudeMd, "utf-8");
  } catch {
    content = `# Project${snippet}`;
    await fs.writeFile(claudeMd, content, "utf-8");
    return;
  }
  if (!content.includes("## skillgate")) {
    await fs.appendFile(claudeMd, snippet, "utf-8");
  }
}

export async function runTeamInit(args: string[]): Promise<void> {
  const mode = parseArgs(args);
  const cwd = process.cwd();

  p.intro(pc.bold(`skillgate team-init (${mode})`));

  let repoRoot: string;
  try {
    repoRoot = await gitRepoRoot(cwd);
  } catch {
    p.log.error("Not inside a git repository. Run from project root.");
    process.exit(1);
  }

  await ensureProfile(repoRoot);
  const hookFile = await writeHook(repoRoot);
  if (mode === "required") {
    await registerSessionStartHook(repoRoot);
  }
  await patchClaudeMd(repoRoot, mode);

  p.log.success(`.skillgate/profile`);
  p.log.success(path.relative(repoRoot, hookFile));
  if (mode === "required") {
    p.log.success(`.claude/settings.json (SessionStart hook)`);
  }
  p.outro(pc.green("Project bound to skillgate team profile."));
}