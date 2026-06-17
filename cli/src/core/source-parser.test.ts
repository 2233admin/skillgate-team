import path from "node:path"
import os from "node:os"
import { describe, expect, it } from "vitest"
import {
  getOwnerRepo,
  getSourceLabel,
  parseSource,
  SourceParseError,
} from "./source-parser.js"

describe("parseSource GitHub", () => {
  it("parses owner/repo shorthand", () => {
    expect(parseSource("vercel-labs/skills")).toEqual({
      type: "github",
      url: "https://github.com/vercel-labs/skills",
      owner: "vercel-labs",
      repo: "skills",
      skillFilter: undefined,
    })
  })

  it("parses owner/repo@skill filter", () => {
    expect(parseSource("owner/repo@my-skill")).toMatchObject({
      type: "github",
      owner: "owner",
      repo: "repo",
      skillFilter: "my-skill",
    })
  })

  it("parses github.com URL with tree ref and subpath", () => {
    expect(
      parseSource(
        "https://github.com/org/repo/tree/main/packages/skills/foo",
      ),
    ).toEqual({
      type: "github",
      url: "https://github.com/org/repo",
      owner: "org",
      repo: "repo",
      ref: "main",
      subpath: "packages/skills/foo",
    })
  })
})

describe("parseSource self-hosted Git", () => {
  it("parses Gitea-style HTTPS URL", () => {
    expect(parseSource("https://gitea.example.com/org/repo.git")).toEqual({
      type: "git",
      url: "https://gitea.example.com/org/repo",
      owner: "org",
      repo: "repo",
      subpath: undefined,
      ref: undefined,
    })
  })

  it("parses GitLab tree URL", () => {
    expect(
      parseSource("https://gitlab.internal/group/pkg/tree/v2/skills"),
    ).toMatchObject({
      type: "git",
      owner: "group",
      repo: "pkg",
      ref: "v2",
      subpath: "skills",
    })
  })
})

describe("parseSource local paths", () => {
  it("resolves relative and home paths", () => {
    const local = parseSource("./my-skills")
    expect(local.type).toBe("local")
    expect(local.localPath).toBe(path.resolve("./my-skills"))

    const home = parseSource("~/skills-pack")
    expect(home.type).toBe("local")
    expect(home.localPath).toBe(path.join(os.homedir(), "skills-pack"))
  })
})

describe("parseSource errors", () => {
  it("rejects SkillsGate registry slugs", () => {
    expect(() => parseSource("@user/my-skill")).toThrow(SourceParseError)
  })

  it("rejects unparseable strings", () => {
    expect(() => parseSource("not-a-valid-source")).toThrow(SourceParseError)
  })
})

describe("getSourceLabel / getOwnerRepo", () => {
  it("labels local and remote sources", () => {
    const local = parseSource("./pack")
    expect(getSourceLabel(local)).toBe(local.localPath)

    const git = parseSource("https://codeberg.org/a/b")
    expect(getSourceLabel(git)).toBe("https://codeberg.org/a/b")
    expect(getOwnerRepo(git)).toBe("a/b")
  })
})