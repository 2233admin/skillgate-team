import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectInstalledAgents } from "./agents.js";
import { listInstalledSkills } from "./installer.js";
import { parseSkillMd } from "./skill-discovery.js";

export type LifecycleState = "hot" | "warm" | "cold";

export interface UsageFact {
  count: number;
  lastUsedAt?: string;
}

export interface LifecycleSkill {
  name: string;
  description: string;
  path: string;
  agents: string[];
  usage: UsageFact;
  state: LifecycleState;
  estimatedTokens: number;
  issues: string[];
  warnings: string[];
}

export interface LifecycleSnapshot {
  generatedAt: string;
  skills: LifecycleSkill[];
  summary: {
    total: number;
    hot: number;
    warm: number;
    cold: number;
    broken: number;
    estimatedTokens: number;
  };
}

const SKILL_CALL = /"skill"\s*:\s*"([^"]+)"/g;
const DATE_FIELD = /"(?:timestamp|ts|time)"\s*:\s*"(20\d{2}-\d{2}-\d{2})/;

export async function collectLifecycleSnapshot(): Promise<LifecycleSnapshot> {
  const agents = await detectInstalledAgents();
  const installed = await listInstalledSkills(agents, "global");
  const usage = await readUsageFacts();
  const skills: LifecycleSkill[] = [];

  for (const [name, info] of installed.entries()) {
    if (await shouldIgnoreInventoryEntry(name, info.path)) continue;
    const parsed = await parseSkillMd(path.join(info.path, "SKILL.md"));
    const fact = usage.get(name) ?? { count: 0 };
    const issues: string[] = [];
    const warnings: string[] = [];
    const description = parsed?.description ?? "";
    if (!parsed) issues.push("missing-or-invalid-frontmatter");
    if (info.agents.length > 1 && (await hasDistinctInstallations(info.paths))) {
      warnings.push("duplicated-across-agents");
    }

    skills.push({
      name,
      description,
      path: info.path,
      agents: info.agents,
      usage: fact,
      state: classifyLifecycleState(fact.count),
      estimatedTokens: estimateTokens(description),
      issues,
      warnings,
    });
  }

  skills.sort((a, b) => b.usage.count - a.usage.count || a.name.localeCompare(b.name));
  const summary = {
    total: skills.length,
    hot: skills.filter((skill) => skill.state === "hot").length,
    warm: skills.filter((skill) => skill.state === "warm").length,
    cold: skills.filter((skill) => skill.state === "cold").length,
    broken: skills.filter((skill) => skill.issues.length > 0).length,
    estimatedTokens: skills.reduce((sum, skill) => sum + skill.estimatedTokens, 0),
  };

  return { generatedAt: new Date().toISOString(), skills, summary };
}

export function classifyLifecycleState(usageCount: number): LifecycleState {
  if (usageCount >= 3) return "hot";
  if (usageCount >= 1) return "warm";
  return "cold";
}

export function estimateTokens(description: string): number {
  return Math.ceil(description.length / 4);
}

async function readUsageFacts(): Promise<Map<string, UsageFact>> {
  const facts = new Map<string, UsageFact>();
  for (const root of await resolveUsageRoots()) {
    for (const file of await findJsonlFiles(root)) {
      let content: string;
      try {
        content = await fs.readFile(file, "utf8");
      } catch {
        continue;
      }
      mergeUsageFacts(facts, extractUsageFacts(content));
    }
  }
  return facts;
}

export function extractUsageFacts(content: string): Map<string, UsageFact> {
  const facts = new Map<string, UsageFact>();
  for (const line of content.split(/\r?\n/)) {
    const date = DATE_FIELD.exec(line)?.[1];
    SKILL_CALL.lastIndex = 0;
    for (const match of line.matchAll(SKILL_CALL)) {
      const name = match[1];
      const fact = facts.get(name) ?? { count: 0 };
      fact.count += 1;
      if (date && (!fact.lastUsedAt || date > fact.lastUsedAt)) fact.lastUsedAt = date;
      facts.set(name, fact);
    }
  }
  return facts;
}

function mergeUsageFacts(target: Map<string, UsageFact>, source: Map<string, UsageFact>): void {
  for (const [name, fact] of source) {
    const current = target.get(name) ?? { count: 0 };
    current.count += fact.count;
    if (fact.lastUsedAt && (!current.lastUsedAt || fact.lastUsedAt > current.lastUsedAt)) {
      current.lastUsedAt = fact.lastUsedAt;
    }
    target.set(name, current);
  }
}

async function resolveUsageRoots(): Promise<string[]> {
  const home = os.homedir();
  const roots = [
    path.join(home, ".claude", "projects"),
    path.join(home, ".codex", "sessions"),
    path.join(home, ".codex", "logs"),
    path.join(home, ".agents", "logs"),
  ];
  const accountRoot = path.join(home, "AppData", "Roaming", "orca", "codex-accounts");
  try {
    for (const entry of await fs.readdir(accountRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(path.join(accountRoot, entry.name, "home", ".codex", "sessions"));
    }
  } catch {
    // Optional Orca account roots are absent on standalone installs.
  }
  return roots;
}

const NON_SKILL_DIRECTORIES = new Set([
  "catalog",
  "demo-notebooks",
  "docs",
  "evals",
  "images",
  "scripts",
]);

async function hasDistinctInstallations(paths: string[]): Promise<boolean> {
  const resolved = await Promise.all(
    paths.map(async (entry) => {
      try {
        return await fs.realpath(entry);
      } catch {
        return path.resolve(entry);
      }
    }),
  );
  return new Set(resolved).size > 1;
}

async function shouldIgnoreInventoryEntry(name: string, directory: string): Promise<boolean> {
  if (name.startsWith(".") || NON_SKILL_DIRECTORIES.has(name)) return true;
  try {
    return (await fs.readdir(directory)).length === 0;
  } catch {
    return true;
  }
}

async function findJsonlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...await findJsonlFiles(fullPath));
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(fullPath);
    }
    return files;
  } catch {
    return [];
  }
}

export function renderLifecycleIndex(snapshot: LifecycleSnapshot): string {
  const lines = ["# Skill Lifecycle Index", "", "Generated: " + snapshot.generatedAt, ""];
  for (const state of ["hot", "warm", "cold"] as const) {
    lines.push(`## ${state.toUpperCase()}`);
    for (const skill of snapshot.skills.filter((item) => item.state === state)) {
      const description = skill.description || "No description";
      lines.push(`- \`${skill.name}\` — ${description}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function renderLifecycleJson(snapshot: LifecycleSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export async function collectLifecycleDoctor(snapshot?: LifecycleSnapshot): Promise<string[]> {
  const current = snapshot ?? await collectLifecycleSnapshot();
  const issues: string[] = [];
  for (const skill of current.skills) {
    for (const issue of skill.issues) issues.push(`${skill.name}: ${issue}`);
  }
  return issues;
}

export async function collectLifecycleProfile(snapshot?: LifecycleSnapshot): Promise<string> {
  const current = snapshot ?? await collectLifecycleSnapshot();
  const hot = current.skills.filter((skill) => skill.state === "hot");
  const warm = current.skills.filter((skill) => skill.state === "warm");
  return [
    "# Skill Profile Preview",
    "",
    "## Hot",
    ...hot.map((skill) => `- ${skill.name}`),
    "",
    "## Warm",
    ...warm.map((skill) => `- ${skill.name}`),
    "",
    "## Cold",
    ...current.skills.filter((skill) => skill.state === "cold").map((skill) => `- ${skill.name}`),
    "",
  ].join("\n");
}

export { readUsageFacts };
    
