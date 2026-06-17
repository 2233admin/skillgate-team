import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify as stringifyYaml } from "yaml";
import { runDoctor } from "./doctor.js";
import { createTempDir, writeTeamFixture } from "./test-fixtures.js";
import type { TeamContext } from "./types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("runDoctor", () => {
  it("reports OK when lock and sources match", async () => {
    const teamRoot = await createTempDir("skillgate-doctor-");
    tempDirs.push(teamRoot);
    await writeTeamFixture(teamRoot);

    const ctx: TeamContext = {
      teamRoot,
      effectiveProfile: "quant",
      profileSource: "default",
    };

    const result = await runDoctor(ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.profile).toBe("quant");
      expect(result.data.drifts.some((d) => d.kind === "lock_missing")).toBe(false);
      expect(result.data.drifts.some((d) => d.kind === "source_missing")).toBe(false);
    }
  });

  it("detects lock_missing for skills without lock entries", async () => {
    const teamRoot = await createTempDir("skillgate-doctor-missing-");
    tempDirs.push(teamRoot);
    await writeTeamFixture(teamRoot);

    const ctx: TeamContext = {
      teamRoot,
      effectiveProfile: "quant",
      profileSource: "default",
    };

    await fs.writeFile(
      path.join(teamRoot, "skills.lock.yaml"),
      stringifyYaml({ version: 1, revision: 1, skills: {} }),
      "utf-8",
    );

    const result = await runDoctor(ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ok).toBe(false);
      expect(result.data.drifts).toContainEqual(
        expect.objectContaining({ skill: "demo-skill", kind: "lock_missing" }),
      );
    }
  });
});