import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CATALOG_DRIFT_THROTTLE_SEC,
  checkCatalogDrift,
} from "./catalog-drift.js";
import { createTempDir, writeTeamFixture } from "./test-fixtures.js";
import type { TeamContext } from "./types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("checkCatalogDrift throttle", () => {
  it("returns fromCache when within throttle window", async () => {
    const teamRoot = await createTempDir("skillgate-drift-");
    const stateDir = await createTempDir("skillgate-drift-state-");
    tempDirs.push(teamRoot, stateDir);
    await writeTeamFixture(teamRoot);

    const nowSec = 1_700_000_000;
    await fs.writeFile(
      path.join(stateDir, "last-update-check"),
      String(nowSec - 60),
      "utf-8",
    );

    const ctx: TeamContext = {
      teamRoot,
      effectiveProfile: "quant",
      profileSource: "default",
    };

    const result = await checkCatalogDrift(ctx, {
      stateDir,
      nowSec,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.fromCache).toBe(true);
      expect(result.data.status).toBe("unknown");
    }
  });

  it("runs check when throttle expired", async () => {
    const teamRoot = await createTempDir("skillgate-drift-expired-");
    const stateDir = await createTempDir("skillgate-drift-state-exp-");
    tempDirs.push(teamRoot, stateDir);
    await writeTeamFixture(teamRoot);

    const nowSec = 1_700_000_000;
    await fs.writeFile(
      path.join(stateDir, "last-update-check"),
      String(nowSec - CATALOG_DRIFT_THROTTLE_SEC - 1),
      "utf-8",
    );

    const ctx: TeamContext = {
      teamRoot,
      effectiveProfile: "quant",
      profileSource: "default",
    };

    const result = await checkCatalogDrift(ctx, {
      stateDir,
      nowSec,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.fromCache).toBe(false);
      expect(result.data.localVersion).toBe("1.0.0");
    }
  });

  it("bypasses throttle when force is true", async () => {
    const teamRoot = await createTempDir("skillgate-drift-force-");
    const stateDir = await createTempDir("skillgate-drift-state-force-");
    tempDirs.push(teamRoot, stateDir);
    await writeTeamFixture(teamRoot);

    const nowSec = 1_700_000_000;
    await fs.writeFile(
      path.join(stateDir, "last-update-check"),
      String(nowSec - 30),
      "utf-8",
    );

    const ctx: TeamContext = {
      teamRoot,
      effectiveProfile: "quant",
      profileSource: "default",
    };

    const result = await checkCatalogDrift(ctx, {
      force: true,
      stateDir,
      nowSec,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.fromCache).toBe(false);
    }
  });
});