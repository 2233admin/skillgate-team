import fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { resolveTeamContext } from "./context.js";
import {
  createTempDir,
  writeLinkedProjectProfile,
  writeTeamFixture,
} from "./test-fixtures.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("resolveTeamContext", () => {
  it("resolves team root from explicit input", async () => {
    const teamRoot = await createTempDir("skillgate-ctx-");
    tempDirs.push(teamRoot);
    await writeTeamFixture(teamRoot);

    const result = await resolveTeamContext({ teamRoot });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.teamRoot).toBe(teamRoot);
      expect(result.data.effectiveProfile).toBe("quant");
      expect(result.data.profileSource).toBe("default");
    }
  });

  it("prefers settings team.root over env default", async () => {
    const teamRoot = await createTempDir("skillgate-ctx-settings-");
    tempDirs.push(teamRoot);
    await writeTeamFixture(teamRoot);

    const result = await resolveTeamContext({
      settings: { "team.root": teamRoot },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.teamRoot).toBe(teamRoot);
    }
  });

  it("reads profile from linked project", async () => {
    const teamRoot = await createTempDir("skillgate-ctx-team-");
    const projectDir = await createTempDir("skillgate-ctx-proj-");
    tempDirs.push(teamRoot, projectDir);
    await writeTeamFixture(teamRoot);
    await writeLinkedProjectProfile(projectDir, "custom");

    const result = await resolveTeamContext({
      teamRoot,
      linkedProject: projectDir,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.effectiveProfile).toBe("custom");
      expect(result.data.profileSource).toBe("linked_project");
      expect(result.data.linkedProject).toBe(projectDir);
    }
  });

  it("returns TEAM_ROOT_MISSING when root does not exist", async () => {
    const result = await resolveTeamContext({
      teamRoot: "C:\\nonexistent-skillgate-team-root",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TEAM_ROOT_MISSING");
    }
  });
});