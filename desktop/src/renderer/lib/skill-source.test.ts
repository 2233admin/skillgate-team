import { describe, expect, it } from "vitest"
import {
  classifySourceString,
  getCatalogSourceKind,
  getSkillSourceKind,
  gitHostLabel,
  isInstallableSource,
  isUpdatableFromSource,
  skillFolderName,
} from "./skill-source"

describe("getSkillSourceKind", () => {
  it("returns localOnly when source is missing", () => {
    expect(getSkillSourceKind({})).toBe("localOnly")
    expect(getSkillSourceKind({ source: "" })).toBe("localOnly")
  })

  it("respects explicit sourceType local", () => {
    expect(
      getSkillSourceKind({
        source: "anthropics/skills",
        sourceType: "local",
      }),
    ).toBe("localOnly")
  })

  it("classifies local paths before slash heuristics", () => {
    expect(getSkillSourceKind({ source: "./my-skill" })).toBe("localOnly")
    expect(getSkillSourceKind({ source: "../skills/foo" })).toBe("localOnly")
    expect(getSkillSourceKind({ source: "~/skills/foo" })).toBe("localOnly")
    expect(getSkillSourceKind({ source: "C:\\skills\\foo" })).toBe("localOnly")
    expect(getSkillSourceKind({ source: "/opt/skills/foo" })).toBe("localOnly")
  })

  it("classifies GitHub owner/repo shorthand", () => {
    expect(getSkillSourceKind({ source: "owner/repo" })).toBe("github")
    expect(getSkillSourceKind({ source: "owner/repo@v1" })).toBe("github")
    expect(
      getSkillSourceKind({
        source: "https://github.com/org/repo",
      }),
    ).toBe("github")
  })

  it("classifies self-hosted Git URLs and sourceType git", () => {
    expect(
      getSkillSourceKind({
        source: "https://gitea.example.com/org/repo.git",
      }),
    ).toBe("git")
    expect(
      getSkillSourceKind({
        source: "https://gitlab.internal/skills/pkg",
        sourceType: "git",
      }),
    ).toBe("git")
  })

  it("honors legacy github sourceType aliases", () => {
    expect(
      getSkillSourceKind({
        source: "custom/host/path",
        sourceType: "skillsgate",
      }),
    ).toBe("github")
  })
})

describe("classifySourceString", () => {
  it("matches getSkillSourceKind for bare strings", () => {
    expect(classifySourceString("owner/repo")).toBe("github")
    expect(classifySourceString("https://git.local/a/b")).toBe("git")
    expect(classifySourceString("./local")).toBe("localOnly")
  })
})

describe("getCatalogSourceKind", () => {
  it("treats owner/repo catalog rows as GitHub", () => {
    expect(getCatalogSourceKind("vercel-labs/skills")).toBe("github")
  })

  it("treats non-GitHub URLs as self-hosted Git", () => {
    expect(getCatalogSourceKind("https://codeberg.org/org/repo")).toBe("git")
  })
})

describe("isUpdatableFromSource / isInstallableSource", () => {
  it("marks github and git as updatable", () => {
    expect(isUpdatableFromSource("github")).toBe(true)
    expect(isUpdatableFromSource("git")).toBe(true)
    expect(isUpdatableFromSource("localOnly")).toBe(false)
  })

  it("accepts installable remote and local path strings", () => {
    expect(isInstallableSource("owner/repo")).toBe(true)
    expect(isInstallableSource("https://gitea.local/x/y")).toBe(true)
    expect(isInstallableSource("./my-skill")).toBe(true)
    expect(isInstallableSource("")).toBe(false)
    expect(isInstallableSource("not-a-valid-source")).toBe(false)
  })
})

describe("skillFolderName", () => {
  it("extracts trailing folder from canonical paths", () => {
    expect(skillFolderName("/home/.agents/skills/foo-bar")).toBe("foo-bar")
    expect(skillFolderName("C:\\Users\\me\\.agents\\skills\\baz")).toBe("baz")
  })
})

describe("gitHostLabel", () => {
  it("returns hostname for http(s) git sources", () => {
    expect(gitHostLabel("https://gitea.corp.example/skills/x")).toBe(
      "gitea.corp.example",
    )
  })

  it("returns null for non-URL sources", () => {
    expect(gitHostLabel("owner/repo")).toBeNull()
    expect(gitHostLabel(undefined)).toBeNull()
  })

  it("returns null for malformed URLs", () => {
    expect(gitHostLabel("https://")).toBeNull()
  })
})

describe("getCatalogSourceKind edge cases", () => {
  it("returns localOnly for empty catalog source", () => {
    expect(getCatalogSourceKind("")).toBe("localOnly")
    expect(getCatalogSourceKind("   ")).toBe("localOnly")
  })
})

describe("getSkillSourceKind slash heuristics", () => {
  it("treats custom/org/path without URL as self-hosted git", () => {
    expect(getSkillSourceKind({ source: "custom/org/path" })).toBe("git")
  })

  it("treats bare slug without slash as localOnly", () => {
    expect(getSkillSourceKind({ source: "scanned-folder" })).toBe("localOnly")
  })
})