import { describe, expect, it } from "vitest";
import { isHelpRequested } from "./team-init.js";

describe("team-init help handling", () => {
  it("recognizes both help flag forms", () => {
    expect(isHelpRequested(["--help"])).toBe(true);
    expect(isHelpRequested(["-h"])).toBe(true);
  });

  it("does not treat normal init arguments as help", () => {
    expect(isHelpRequested(["--mode", "required"])).toBe(false);
  });
});
