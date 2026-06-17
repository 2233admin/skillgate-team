import { describe, expect, it } from "vitest"
import {
  readTeamSettingsFromStore,
  shouldShowTeamDriftBadge,
  toTeamDriftState,
} from "./team-ipc"
import type { SettingsStore } from "./db/settings"

function mockStore(values: Record<string, unknown> = {}): SettingsStore {
  return {
    get<T>(key: string, defaultValue: T): T {
      return (values[key] as T | undefined) ?? defaultValue
    },
    set() {},
    getAll() {
      return values
    },
  } as SettingsStore
}

describe("team-ipc helpers", () => {
  it("readTeamSettingsFromStore omits empty keys", () => {
    expect(readTeamSettingsFromStore(mockStore())).toEqual({})
    expect(
      readTeamSettingsFromStore(
        mockStore({
          "team.root": "  /tmp/team  ",
          "team.linkedProject": "",
          "team.lastProfile": "quant",
        }),
      ),
    ).toEqual({
      "team.root": "/tmp/team",
      "team.lastProfile": "quant",
    })
  })

  it("shouldShowTeamDriftBadge is true only when behind", () => {
    expect(shouldShowTeamDriftBadge(null)).toBe(false)
    expect(
      shouldShowTeamDriftBadge({ status: "ok", fromCache: false }),
    ).toBe(false)
    expect(
      shouldShowTeamDriftBadge({ status: "unknown", fromCache: true }),
    ).toBe(false)
    expect(
      shouldShowTeamDriftBadge({
        status: "behind",
        fromCache: false,
        localVersion: "1",
        remoteVersion: "2",
      }),
    ).toBe(true)
  })

  it("toTeamDriftState maps success and error results", () => {
    expect(
      toTeamDriftState({
        ok: true,
        data: {
          status: "behind",
          fromCache: false,
          localVersion: "abc",
          remoteVersion: "def",
        },
      }),
    ).toEqual({
      status: "behind",
      fromCache: false,
      localVersion: "abc",
      remoteVersion: "def",
      message: undefined,
    })

    expect(
      toTeamDriftState({
        ok: false,
        error: { code: "NETWORK_TIMEOUT", message: "timed out" },
      }),
    ).toEqual({
      status: "unknown",
      fromCache: false,
      error: "timed out",
      message: "timed out",
    })
  })
})