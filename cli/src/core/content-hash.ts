import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const SKIP = new Set([".git", "node_modules", ".DS_Store"]);

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out.sort();
}

export async function hashDirectory(dir: string): Promise<string> {
  const files = await walkFiles(dir);
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    const rel = path.relative(dir, file).replace(/\\/g, "/");
    const content = await fs.readFile(file);
    hash.update(rel);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

export async function hashSkillContent(content: string): Promise<string> {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}