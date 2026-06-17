import { ipcMain, type BrowserWindow } from "electron"
import {
  checkCatalogDrift,
  getLastApplyState,
  getProfileSummary,
  listProfiles,
  resolveTeamContext,
  runApply,
  runDoctor,
  runLockVerify,
  type ApplyOptions,
  type CatalogDriftResult,
  type LockVerifyOptions,
  type Result,
  type TeamSettings,
} from "skillgate/team-api"
import { openDb } from "./db/index"
import { SettingsStore } from "./db/settings"

export const TEAM_DRIFT_EVENT = "team:drift-state"

export interface TeamDriftState {
  status: CatalogDriftResult["status"]
  fromCache: boolean
  localVersion?: string
  remoteVersion?: string
  message?: string
  error?: string
}

export interface TeamSettingsInput {
  teamRoot?: string
  linkedProject?: string
  profile?: string
}

let cachedDriftState: TeamDriftState | null = null
let teamMainWindow: BrowserWindow | null = null

export function setTeamMainWindow(win: BrowserWindow | null): void {
  teamMainWindow = win
}

export function getTeamDriftState(): TeamDriftState | null {
  return cachedDriftState
}

export function shouldShowTeamDriftBadge(state: TeamDriftState | null): boolean {
  return state?.status === "behind"
}

export function readTeamSettingsFromStore(store: SettingsStore): TeamSettings {
  const teamRoot = store.get<string>("team.root", "").trim()
  const linkedProject = store.get<string>("team.linkedProject", "").trim()
  const lastProfile = store.get<string>("team.lastProfile", "").trim()

  const settings: TeamSettings = {}
  if (teamRoot) settings["team.root"] = teamRoot
  if (linkedProject) settings["team.linkedProject"] = linkedProject
  if (lastProfile) settings["team.lastProfile"] = lastProfile
  return settings
}

export function toTeamDriftState(
  result: Result<CatalogDriftResult>,
): TeamDriftState {
  if (!result.ok) {
    return {
      status: "unknown",
      fromCache: false,
      error: result.error.message,
      message: result.error.message,
    }
  }

  return {
    status: result.data.status,
    fromCache: result.data.fromCache,
    localVersion: result.data.localVersion,
    remoteVersion: result.data.remoteVersion,
    message: result.data.message,
  }
}

function broadcastDriftState(state: TeamDriftState): void {
  cachedDriftState = state
  if (teamMainWindow && !teamMainWindow.isDestroyed()) {
    teamMainWindow.webContents.send(TEAM_DRIFT_EVENT, state)
  }
}

async function resolveContextFromStore(
  store: SettingsStore,
  input: TeamSettingsInput = {},
) {
  const settings = readTeamSettingsFromStore(store)
  return resolveTeamContext({
    teamRoot: input.teamRoot,
    linkedProject: input.linkedProject,
    profile: input.profile,
    settings,
  })
}

function getSettingsStoreForTeam(store?: SettingsStore): SettingsStore {
  if (store) return store
  return new SettingsStore(openDb())
}

export async function runStartupCatalogDriftCheck(
  store?: SettingsStore,
): Promise<TeamDriftState> {
  const settingsStore = getSettingsStoreForTeam(store)
  const ctxResult = await resolveContextFromStore(settingsStore)
  if (!ctxResult.ok) {
    const state: TeamDriftState = {
      status: "unknown",
      fromCache: false,
      message: ctxResult.error.message,
      error: ctxResult.error.message,
    }
    broadcastDriftState(state)
    return state
  }

  const driftResult = await checkCatalogDrift(ctxResult.data, { force: false })
  const state = toTeamDriftState(driftResult)
  broadcastDriftState(state)
  return state
}

export function registerTeamIpcHandlers(store: SettingsStore): void {
  ipcMain.handle("team:getContext", async (_event, input?: TeamSettingsInput) => {
    return resolveContextFromStore(store, input ?? {})
  })

  ipcMain.handle("team:listProfiles", async (_event, input?: TeamSettingsInput) => {
    const ctxResult = await resolveContextFromStore(store, input ?? {})
    if (!ctxResult.ok) return ctxResult
    return listProfiles(ctxResult.data)
  })

  ipcMain.handle(
    "team:getProfileSummary",
    async (_event, profile: string, input?: TeamSettingsInput) => {
      const ctxResult = await resolveContextFromStore(store, input ?? {})
      if (!ctxResult.ok) return ctxResult
      return getProfileSummary(ctxResult.data, profile)
    },
  )

  ipcMain.handle(
    "team:apply",
    async (_event, options?: ApplyOptions & TeamSettingsInput) => {
      const { teamRoot, linkedProject, profile, ...applyOptions } = options ?? {}
      const ctxResult = await resolveContextFromStore(store, {
        teamRoot,
        linkedProject,
        profile,
      })
      if (!ctxResult.ok) return ctxResult

      const profileName = applyOptions.profile ?? ctxResult.data.effectiveProfile
      const result = await runApply(ctxResult.data, applyOptions)
      if (result.ok) {
        store.set("team.lastProfile", profileName)
      }
      return result
    },
  )

  ipcMain.handle(
    "team:doctor",
    async (_event, options?: { profile?: string } & TeamSettingsInput) => {
      const { teamRoot, linkedProject, profile, ...doctorOptions } = options ?? {}
      const ctxResult = await resolveContextFromStore(store, {
        teamRoot,
        linkedProject,
        profile,
      })
      if (!ctxResult.ok) return ctxResult
      return runDoctor(ctxResult.data, doctorOptions)
    },
  )

  ipcMain.handle(
    "team:lockVerify",
    async (_event, options?: LockVerifyOptions & TeamSettingsInput) => {
      const { teamRoot, linkedProject, profile, ...lockOptions } = options ?? {}
      const ctxResult = await resolveContextFromStore(store, {
        teamRoot,
        linkedProject,
        profile,
      })
      if (!ctxResult.ok) return ctxResult
      return runLockVerify(ctxResult.data, lockOptions)
    },
  )

  ipcMain.handle(
    "team:catalogDrift",
    async (_event, options?: { force?: boolean } & TeamSettingsInput) => {
      const { teamRoot, linkedProject, profile, force } = options ?? {}
      const ctxResult = await resolveContextFromStore(store, {
        teamRoot,
        linkedProject,
        profile,
      })
      if (!ctxResult.ok) {
        const state = toTeamDriftState({
          ok: false,
          error: ctxResult.error,
        })
        broadcastDriftState(state)
        return ctxResult
      }

      const driftResult = await checkCatalogDrift(ctxResult.data, { force })
      const state = toTeamDriftState(driftResult)
      broadcastDriftState(state)
      return driftResult
    },
  )

  ipcMain.handle("team:getDriftState", async () => {
    return cachedDriftState
  })

  ipcMain.handle("team:getLastApplyState", async () => {
    return getLastApplyState()
  })

  ipcMain.handle(
    "team:setLastProfile",
    async (_event, profile: string) => {
      const trimmed = profile.trim()
      if (!trimmed) return
      store.set("team.lastProfile", trimmed)
    },
  )
}