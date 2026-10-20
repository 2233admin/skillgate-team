import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isHelpRequested, runTeamInit } from "./team-init.js";

describe("team-init help handling", () => {
  it("recognizes both help flag forms", () => {
    expect(isHelpRequested(["--help"])).toBe(true);
    expect(isHelpRequested(["-h"])).toBe(true);
  });

  it("does not treat normal init arguments as help", () => {
    expect(isHelpRequested(["--mode", "required"])).toBe(false);
  });

  it("does not write project files when help is requested", async () => {
    const originalCwd = process.cwd();
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skillgate-team-init-"));
    try {
      process.chdir(tempRoot);
      await runTeamInit(["--help"]);
      await expect(fs.readdir(tempRoot)).resolves.toEqual([]);
    } finally {
      process.chdir(originalCwd);
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
