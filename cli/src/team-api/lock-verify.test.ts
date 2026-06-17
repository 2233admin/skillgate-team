import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify as stringifyYaml } from "yaml";
import { runLockVerify } from "./lock-verify.js";
import { createTempDir, writeTeamFixture } from "./test-fixtures.js";
import type { TeamContext } from "./types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("runLockVerify", () => {
  it("returns OK when lock hashes match disk", async () => {
    const teamRoot = await createTempDir("skillgate-lock-");
    tempDirs.push(teamRoot);
    const { skillHash } = await writeTeamFixture(teamRoot);

    const ctx: TeamContext = {
      teamRoot,
      effectiveProfile: "quant",
      profileSource: "default",
    };

    const result = await runLockVerify(ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ok).toBe(true);
      expect(result.data.mismatchCount).toBe(0);
      expect(result.data.mismatches[0]?.diskHash ?? skillHash).toBe(skillHash);
    }
  });

  it("detects mismatches and can write corrected hashes", async () => {
    const teamRoot = await createTempDir("skillgate-lock-write-");
    tempDirs.push(teamRoot);
    const { skillHash } = await writeTeamFixture(teamRoot);

    await fs.writeFile(
      path.join(teamRoot, "skills.lock.yaml"),
      stringifyYaml({
        version: 1,
        revision: 1,
        skills: {
          "demo-skill": {
            source: "vendored",
            path: "skills/demo-skill",
            contentHash: "deadbeefdeadbeef",
          },
        },
      }),
      "utf-8",
    );

    const ctx: TeamContext = {
      teamRoot,
      effectiveProfile: "quant",
      profileSource: "default",
    };

    const verify = await runLockVerify(ctx);
    expect(verify.ok).toBe(true);
    if (verify.ok) {
      expect(verify.data.ok).toBe(false);
      expect(verify.data.mismatchCount).toBe(1);
    }

    const fixed = await runLockVerify(ctx, { write: true });
    expect(fixed.ok).toBe(true);
    if (fixed.ok) {
      expect(fixed.data.updated).toBe(true);
      expect(fixed.data.ok).toBe(true);
    }
  });
});