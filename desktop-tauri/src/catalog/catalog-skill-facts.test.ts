import { describe, expect, it } from "vitest"
import type { CatalogItem } from "../lib/app-api"
import {
  catalogItemSupportsPlatform,
  catalogSkillFacts,
  catalogSkillSearchText,
  catalogSourceLabel,
} from "./catalog-skill-facts"

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
      source: "Plugin · openai-bundled",
      usage: "Usage not tracked",
      locations: "2 locations",
      risk: "Review signals",
      riskDetail: "SKILL.md static signals: Elevated privileges. Partial check only; review in context.",
    })
  })

  it("makes skill-only facts searchable", () => {
    expect(catalogSkillSearchText(item)).toContain("openai-bundled")
    expect(catalogSkillSearchText(item)).toContain("Elevated privileges")
    expect(catalogSkillSearchText(item)).toContain("Shared")
  })

  it("keeps the scanned platform as an adapter even when metadata lists other compatible tools", () => {
    expect(catalogItemSupportsPlatform(item, "shared")).toBe(true)
    expect(catalogItemSupportsPlatform(item, "claude")).toBe(true)
    expect(catalogItemSupportsPlatform(item, "cursor")).toBe(false)
  })

  it("labels provenance by evidence instead of presenting declarations as downloads", () => {
    expect(catalogSourceLabel("manifest", "https://example.com/skill")).toBe("Declared source · https://example.com/skill")
    expect(catalogSourceLabel("plugin", "openai-bundled")).toBe("Plugin · openai-bundled")
    expect(catalogSourceLabel("local", "ignored label")).toBe("Local filesystem")
    expect(catalogSourceLabel("external", "Selected folder")).toBe("External root · Selected folder")
  })

  it("describes an empty static-signal result without claiming the skill is safe", () => {
    const quiet = {
      ...item,
      skillMeta: { ...item.skillMeta!, riskLevel: "low" as const, riskSignals: [] },
    }
    const facts = catalogSkillFacts(quiet)

    expect(facts?.risk).toBe("No signals")
    expect(facts?.riskDetail).toContain("SKILL.md")
    expect(facts?.riskDetail).toContain("does not establish safety")
  })
})
