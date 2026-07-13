import { describe, expect, it } from "vitest"
import {
  APP_COMMANDS,
  createAppAPI,
  type AppDescription,
  type AppResult,
  type AppTransport,
  type RequestMeta,
} from "./app-api"
import { createCatalogClient } from "./catalog-client"
import { createTauriTransport } from "./tauri-transport"

const meta: RequestMeta = {
  requestId: "request-1",
  correlationId: "correlation-1",
  idempotencyKey: "idem-1",
  deadlineMs: 5_000,
}

const description: AppDescription = {
  contract: { major: 1, minor: 7 },
  implementation: { name: "fixture", version: "1", platform: "windows", arch: "x86_64" },
  capabilities: {} as AppDescription["capabilities"],
}

function success<T>(data: T, requestMeta = meta): AppResult<T> {
  return { ok: true, data, meta: { requestId: requestMeta.requestId, correlationId: requestMeta.correlationId, completedAt: "2026-07-13T00:00:00Z" } }
}

function capturingTransport(data: unknown = null) {
  const calls: Array<{ command: string; payload: { input: unknown; meta: RequestMeta } }> = []
  const transport: AppTransport = {
    async invoke<T>(command: string, payload: { input: unknown; meta: RequestMeta }): Promise<AppResult<T>> {
      calls.push({ command, payload })
      return success((command === APP_COMMANDS.describe ? description : data) as T, payload.meta)
    },
  }
  return { calls, transport }
}

describe("AppAPI v1 wire contract", () => {
  it("exports the exact v1 command fixture", () => {
    expect(APP_COMMANDS).toMatchInlineSnapshot(`
      {
        "agentLaunchGetHarnessPolicy": "agent_launch_get_harness_policy",
        "agentLaunchPrepare": "agent_launch_prepare",
        "agentsDetect": "agents_detect",
        "applicationGetVersion": "application_get_version",
        "cancel": "app_cancel",
        "catalogFetchSkillContent": "catalog_fetch_skill_content",
        "catalogFetchTrending": "catalog_fetch_trending",
        "catalogGetItem": "catalog_get_item",
        "catalogList": "catalog_list",
        "catalogListInstalled": "catalog_list_installed",
        "catalogRescan": "catalog_rescan",
        "catalogScan": "catalog_scan",
        "catalogSearch": "catalog_search",
        "catalogSearchRemote": "catalog_search_remote",
        "catalogSelectRoot": "catalog_select_root",
        "catalogWatch": "catalog_watch",
        "describe": "app_describe",
        "eventsSubscribe": "events_subscribe",
        "eventsUnsubscribe": "events_unsubscribe",
        "filesDelete": "files_delete",
        "filesListDirectory": "files_list_directory",
        "filesListSupportingFiles": "files_list_supporting_files",
        "filesReadSkillContent": "files_read_skill_content",
        "filesReadSupportingFile": "files_read_supporting_file",
        "filesRecover": "files_recover",
        "filesReveal": "files_reveal",
        "filesStat": "files_stat",
        "filesTree": "files_tree",
        "filesWriteSkillContent": "files_write_skill_content",
        "preferencesAll": "preferences_all",
        "preferencesGet": "preferences_get",
        "preferencesListFavorites": "preferences_list_favorites",
        "preferencesSet": "preferences_set",
        "preferencesToggleFavorite": "preferences_toggle_favorite",
        "remotesApplyPush": "remotes_apply_push",
        "remotesCount": "remotes_count",
        "remotesCreate": "remotes_create",
        "remotesDelete": "remotes_delete",
        "remotesList": "remotes_list",
        "remotesListSkills": "remotes_list_skills",
        "remotesPreviewPush": "remotes_preview_push",
        "remotesReadSkill": "remotes_read_skill",
        "remotesSync": "remotes_sync",
        "remotesTest": "remotes_test",
        "remotesUpdate": "remotes_update",
        "remotesWriteSkill": "remotes_write_skill",
        "skillsAddToAgent": "skills_add_to_agent",
        "skillsCreate": "skills_create",
        "skillsInstall": "skills_install",
        "skillsInstallViaCli": "skills_install_via_cli",
        "skillsRemove": "skills_remove",
        "skillsRemoveFromAgent": "skills_remove_from_agent",
        "skillsUpdate": "skills_update",
        "teamApply": "team_apply",
        "teamCatalogDrift": "team_catalog_drift",
        "teamDoctor": "team_doctor",
        "teamGetContext": "team_get_context",
        "teamGetDriftState": "team_get_drift_state",
        "teamGetLastApplyState": "team_get_last_apply_state",
        "teamGetProfileSummary": "team_get_profile_summary",
        "teamListProfiles": "team_list_profiles",
        "teamLockVerify": "team_lock_verify",
        "teamSetLastProfile": "team_set_last_profile",
        "terminalsClose": "terminals_close",
        "terminalsCreate": "terminals_create",
        "terminalsResize": "terminals_resize",
        "terminalsWrite": "terminals_write",
        "updatesCheck": "updates_check",
        "updatesGetState": "updates_get_state",
        "updatesInstall": "updates_install",
      }
    `)
  })

  it("uses exact input plus RequestMeta envelopes for every namespace", async () => {
    const { calls, transport } = capturingTransport()
    const api = createAppAPI(transport)
    await api.cancel({ requestId: "target" }, meta)
    await api.application.getVersion({}, meta)
    await api.agents.detect({}, meta)
    await api.agentLaunch.getHarnessPolicy({ agentItemId: "agent-1" }, meta)
    await api.catalog.scan({ grantId: "grant-home", force: true }, meta)
    await api.files.stat({ location: { grantId: "grant-home", relativePath: "skills/a/SKILL.md" } }, meta)
    await api.skills.remove({ name: "a" }, meta)
    await api.remotes.list({}, meta)
    await api.preferences.all({}, meta)
    await api.updates.getState({}, meta)
    await api.team.doctor({ profile: "quant" }, meta)
    await api.terminals.resize({ terminalId: "pty-1", columns: 120, rows: 40 }, meta)
    await api.events.subscribe({ kind: "updates.state" }, () => {}, meta)
    expect(calls.map(({ command }) => command)).toEqual([
      "app_cancel", "application_get_version", "agents_detect", "agent_launch_get_harness_policy",
      "catalog_scan", "files_stat", "skills_remove", "remotes_list", "preferences_all",
      "updates_get_state", "team_doctor", "terminals_resize", "events_subscribe",
    ])
    expect(calls[4]).toEqual({ command: "catalog_scan", payload: { input: { grantId: "grant-home", force: true }, meta } })
    expect(JSON.stringify(calls)).not.toMatch(/[A-Z]:\\|\/Users\//)
  })

  it("routes unavailable operations to the host instead of synthesizing them", async () => {
    const calls: string[] = []
    const transport: AppTransport = {
      async invoke<T>(command: string, payload: { input: unknown; meta: RequestMeta }): Promise<AppResult<T>> {
        calls.push(command)
        return { ok: false, error: { code: "CAPABILITY_UNAVAILABLE", message: "not shipped", category: "unavailable", retryable: false }, meta: { requestId: payload.meta.requestId, correlationId: payload.meta.correlationId, completedAt: "now" } } as AppResult<T>
      },
    }
    const result = await createAppAPI(transport).skills.update({ name: "x" }, meta)
    expect(calls).toEqual(["skills_update"])
    expect(result).toMatchObject({ ok: false, error: { code: "CAPABILITY_UNAVAILABLE" } })
  })

  it("accepts higher minor versions and rejects incompatible major versions", async () => {
    const higher = await createAppAPI(capturingTransport().transport).describe({ requestedMajor: 1 })
    expect(higher).toMatchObject({ ok: true, data: { contract: { major: 1, minor: 7 } } })
    const badTransport: AppTransport = {
      async invoke<T>(_command: string, payload: { input: unknown; meta: RequestMeta }): Promise<AppResult<T>> {
        return success({ ...description, contract: { major: 2, minor: 0 } } as unknown as T, payload.meta)
      },
    }
    const incompatible = await createAppAPI(badTransport).describe()
    expect(incompatible).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_VERSION", details: { expectedMajor: 1, actualMajor: 2 } } })
  })
})

describe("CatalogClient", () => {
  it("converts positional UI calls into exact AppAPI DTOs", async () => {
    const { calls, transport } = capturingTransport()
    const client = createCatalogClient(createAppAPI(transport))
    await client.scan("grant-home", true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ command: "catalog_scan", payload: { input: { grantId: "grant-home", force: true }, meta: { requestId: expect.any(String), correlationId: expect.any(String) } } })
  })
})

describe("Tauri transport", () => {
  it("converts thrown transport failures and preserves request metadata", async () => {
    const transport = createTauriTransport(async () => { throw new Error("bridge down at C:\\Users\\secret\\skill.md") })
    const result = await transport.invoke("skills_update", { input: { name: "x" }, meta })
    expect(result).toMatchObject({ ok: false, error: { code: "TRANSPORT_UNAVAILABLE", category: "unavailable", retryable: true, details: { command: "skills_update" } }, meta: { requestId: "request-1", correlationId: "correlation-1" } })
    expect(JSON.stringify(result)).not.toContain("Users")
    expect(JSON.stringify(result)).not.toContain("secret")
  })
})
