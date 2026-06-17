import { describe, expect, it } from "vitest"
import {
  computeServerStatus,
  computeSkillSyncDiff,
  remoteSkillsByFolder,
} from "./server-status"

describe("remoteSkillsByFolder", () => {
  it("indexes SKILL.md paths by trailing folder name", () => {
    const map = remoteSkillsByFolder([
      {
        remotePath: "/home/user/.agents/skills/foo-bar/SKILL.md",
        contentHash: "abc",
      },
      { remotePath: "/SKILL.md", contentHash: "ignored-root" },
      { remotePath: "/home/user/.agents/skills/baz/SKILL.md", contentHash: null },
    ])
    expect(map.get("foo-bar")).toBe("abc")
    expect(map.get("baz")).toBeNull()
    expect(map.size).toBe(2)
  })

  it("ignores non-SKILL.md remote paths", () => {
    const map = remoteSkillsByFolder([
      { remotePath: "/home/user/.agents/skills/foo/README.md", contentHash: "x" },
    ])
    expect(map.size).toBe(0)
  })
})

describe("computeSkillSyncDiff", () => {
  const remote = (folder: string, hash: string | null) => ({
    remotePath: `/remote/.agents/skills/${folder}/SKILL.md`,
    contentHash: hash,
  })

  it("classifies newLocal, needsPush, inSync, and onlyRemote", () => {
    const diff = computeSkillSyncDiff(
      [
        { folderName: "only-local", contentHash: "h1" },
        { folderName: "stale", contentHash: "local-hash" },
        { folderName: "matched", contentHash: "same" },
      ],
      [remote("stale", "remote-hash"), remote("matched", "same"), remote("orphan", "r")],
    )

    expect(diff.counts).toEqual({
      newLocal: 1,
      needsPush: 1,
      inSync: 1,
      onlyRemote: 1,
    })
    expect(diff.entries.map((e) => [e.folderName, e.kind])).toEqual([
      ["stale", "needsPush"],
      ["only-local", "newLocal"],
      ["orphan", "onlyRemote"],
      ["matched", "inSync"],
    ])
  })
})

describe("computeServerStatus", () => {
  const serverOk = { lastSyncAt: "2026-01-01T00:00:00Z", lastSyncError: null }

  it("returns syncFailed when lastSyncError is set", () => {
    expect(
      computeServerStatus(
        { lastSyncAt: "2026-01-01", lastSyncError: "ssh timeout" },
        [],
        [],
      ).kind,
    ).toBe("syncFailed")
  })

  it("returns neverSynced when lastSyncAt is missing", () => {
    expect(
      computeServerStatus({ lastSyncAt: null, lastSyncError: null }, [], []).kind,
    ).toBe("neverSynced")
  })

  it("returns pendingPush when local differs from remote", () => {
    const status = computeServerStatus(
      serverOk,
      [{ folderName: "foo", contentHash: "local" }],
      [
        {
          remotePath: "/r/.agents/skills/foo/SKILL.md",
          contentHash: "remote",
        },
      ],
    )
    expect(status).toMatchObject({
      kind: "pendingPush",
      dotColor: "amber",
      pendingPush: 1,
      localCount: 1,
    })
  })

  it("returns onlyOnRemote when remote has extra skills", () => {
    const status = computeServerStatus(serverOk, [], [
      {
        remotePath: "/r/.agents/skills/extra/SKILL.md",
        contentHash: "x",
      },
    ])
    expect(status).toMatchObject({
      kind: "onlyOnRemote",
      onlyOnRemote: 1,
    })
  })

  it("returns inSync when all folders match", () => {
    const status = computeServerStatus(
      serverOk,
      [{ folderName: "foo", contentHash: "same" }],
      [
        {
          remotePath: "/r/.agents/skills/foo/SKILL.md",
          contentHash: "same",
        },
      ],
    )
    expect(status).toMatchObject({
      kind: "inSync",
      dotColor: "green",
      localCount: 1,
    })
  })
})