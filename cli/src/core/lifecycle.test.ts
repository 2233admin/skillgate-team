import { describe, expect, it } from "vitest";
import { classifyLifecycleState, estimateTokens, extractUsageFacts } from "./lifecycle.js";

describe("skill lifecycle classification", () => {
  it("marks repeated skills hot", () => {
    expect(classifyLifecycleState(3)).toBe("hot");
    expect(classifyLifecycleState(12)).toBe("hot");
  });

  it("marks used-once skills warm and unused skills cold", () => {
    expect(classifyLifecycleState(1)).toBe("warm");
    expect(classifyLifecycleState(0)).toBe("cold");
  });

  it("estimates metadata tokens conservatively", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("12345678")).toBe(2);
  });

  it("extracts and aggregates skill usage from any agent JSONL source", () => {
    const facts = extractUsageFacts([
      '{"timestamp":"2026-08-20","skill":"skill-a"}',
      '{"timestamp":"2026-08-21","skill":"skill-a"}',
      '{"timestamp":"2026-08-21","skill":"skill-b"}',
    ].join("\n"));

    expect(facts.get("skill-a")).toEqual({ count: 2, lastUsedAt: "2026-08-21" });
    expect(facts.get("skill-b")).toEqual({ count: 1, lastUsedAt: "2026-08-21" });
  });
});
    
