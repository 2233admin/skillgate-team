import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { hashDirectory } from "../core/content-hash.js";

export async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeTeamFixture(root: string): Promise<{
  skillHash: string;
  profileName: string;
}> {
  const skillDir = path.join(root, "skills", "demo-skill");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    "---\nname: demo-skill\ndescription: test\n---\n# Demo\n",
    "utf-8",
  );

  const skillHash = await hashDirectory(skillDir);

  const profilesDir = path.join(root, "profiles");
  await fs.mkdir(profilesDir, { recursive: true });
  await fs.writeFile(
    path.join(profilesDir, "quant.yaml"),
    stringifyYaml({
      name: "quant",
      description: "Test profile",
      skills: ["demo-skill"],
    }),
    "utf-8",
  );

  await fs.writeFile(
    path.join(root, "skills.lock.yaml"),
    stringifyYaml({
      version: 1,
      revision: 1,
      skills: {
        "demo-skill": {
          source: "vendored",
          path: "skills/demo-skill",
          contentHash: skillHash,
        },
      },
    }),
    "utf-8",
  );

  await fs.writeFile(path.join(root, "VERSION"), "1.0.0\n", "utf-8");

  return { skillHash, profileName: "quant" };
}

export async function writeLinkedProjectProfile(
  projectDir: string,
  profile: string,
): Promise<void> {
  const dir = path.join(projectDir, ".skillgate");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "profile"), `${profile}\n`, "utf-8");
}