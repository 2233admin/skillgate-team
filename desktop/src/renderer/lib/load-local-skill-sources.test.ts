import { describe, expect, it } from "vitest"
import { buildLocalSkillSourceByFolder } from "./build-local-skill-source-map"

describe("buildLocalSkillSourceByFolder", () => {
  it("ignores project-scoped skills and rows without canonicalPath", () => {
    const map = buildLocalSkillSourceByFolder([
      {
        scope: "project",
        canonicalPath: "/home/.agents/skills/foo",
        source: "owner/repo",
      },
      { scope: "global", canonicalPath: "" },
    ])
    expect(map.size).toBe(0)
  })

  it("maps global skills by folder basename", () => {
    const map = buildLocalSkillSourceByFolder([
      {
        scope: "global",
        canonicalPath: "C:\\Users\\me\\.agents\\skills\\my-skill",
        source: "anthropics/skills",
        sourceType: "github",
      },
    ])
    expect(map.get("my-skill")).toEqual({
      kind: "github",
      source: "anthropics/skills",
    })
  })

  it("prefers remote source over localOnly for the same folder", () => {
    const map = buildLocalSkillSourceByFolder([
      {
        scope: "global",
        canonicalPath: "/home/.agents/skills/dup-skill",
        source: "./scanned-only",
      },
      {
        scope: "global",
        canonicalPath: "/home/.agents/skills/dup-skill",
        source: "https://gitea.corp.example/org/pkg",
        sourceType: "git",
      },
    ])
    expect(map.get("dup-skill")).toEqual({
      kind: "git",
      source: "https://gitea.corp.example/org/pkg",
    })
  })

  it("keeps localOnly when a second row is also localOnly", () => {
    const map = buildLocalSkillSourceByFolder([
      {
        scope: "global",
        canonicalPath: "/home/.agents/skills/local-skill",
        source: "./first",
      },
      {
        scope: "global",
        canonicalPath: "/home/.agents/skills/local-skill",
        source: "~/second",
      },
    ])
    expect(map.get("local-skill")?.kind).toBe("localOnly")
  })

  it("does not replace github with git when folder already has github", () => {
    const map = buildLocalSkillSourceByFolder([
      {
        scope: "global",
        canonicalPath: "/home/.agents/skills/shared",
        source: "owner/repo",
      },
      {
        scope: "global",
        canonicalPath: "/home/.agents/skills/shared",
        source: "https://gitlab.internal/org/repo",
        sourceType: "git",
      },
    ])
    expect(map.get("shared")?.kind).toBe("github")
  })
})