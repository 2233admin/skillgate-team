import { describe, expect, it } from "vitest"
import type { CatalogItem } from "../lib/app-api"
import { catalogSkillFacts, catalogSkillSearchText } from "./catalog-skill-facts"

const item: CatalogItem = {
  itemId: "skill", canonicalItemId: "skill", kind: "skill", platform: "shared", scope: "global",
  projectName: null, groupId: "shared", groupLabel: "Shared", name: "Deploy", slug: "deploy",
  description: "Deploy safely", location: { grantId: "home", relativePath: ".agents/skills/deploy/SKILL.md" },
  displayPath: ".agents/skills/deploy/SKILL.md", aliases: [], createdAt: null, modifiedAt: "now",
  skillMeta: {
    compatibleWith: ["claude", "codex"], installationLevel: "plugin", sourceKind: "plugin",
    sourceLabel: "openai-bundled", usageStatus: "untracked", usageCount: null, lastUsedAt: null,
    installationCount: 2, riskLevel: "medium", riskSignals: ["elevatedPrivileges"],
  },
}

describe("catalog skill facts", () => {
  it("formats adapters, provenance, usage, locations, and health without inventing usage", () => {
    expect(catalogSkillFacts(item)).toEqual({
      adapters: "Claude Code + Codex",
      installation: "Plugin",
      source: "openai-bundled",
      usage: "Usage not tracked",
      locations: "2 locations",
      risk: "Review",
      riskDetail: "Elevated privileges",
    })
  })

  it("makes skill-only facts searchable", () => {
    expect(catalogSkillSearchText(item)).toContain("openai-bundled")
    expect(catalogSkillSearchText(item)).toContain("Elevated privileges")
  })
})
