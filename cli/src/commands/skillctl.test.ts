import { describe, expect, it } from "vitest";
import { doctorExitCode } from "./skillctl.js";

describe("skillctl doctor exit status", () => {
  it("passes when only warnings are present", () => {
    expect(doctorExitCode(0)).toBe(0);
  });

  it("fails when blocking issues are present", () => {
    expect(doctorExitCode(1)).toBe(1);
  });
});
