import { useCallback, useEffect, useState } from "react"
import { useDb } from "../db/context.js"
import {
  checkCatalogDrift,
  getLastApplyState,
  getProfileSummary,
  listProfiles,
  resolveTeamContext,
  runApply,
  runDoctor,
  runLockVerify,
  type ApplyResult,
  type CatalogDriftResult,
  type DoctorResult,
  type LastApplyState,
  type LockVerifyResult,
  type ProfileSummary,
  type Result,
  type TeamContext,
} from "../../../cli/src/team-api/index.js"

export interface TeamState {
  loading: boolean
  context: TeamContext | null
  contextError: string | null
  profiles: string[]
  profileSummaries: Record<string, ProfileSummary>
  selectedProfile: string
  drift: CatalogDriftResult | null
  driftBehind: boolean
  lastApply: LastApplyState | null
  actionLoading: boolean
  lastDoctor: DoctorResult | null
  lastApplyResult: ApplyResult | null
  lastLockVerify: LockVerifyResult | null
  lastActionError: string | null
}

export interface TeamActions {
  refresh: () => Promise<void>
  refreshDrift: (force?: boolean) => Promise<void>
  selectProfile: (name: string) => void
  apply: (opts?: { writeLock?: boolean; dryRun?: boolean }) => Promise<Result<ApplyResult>>
  doctor: () => Promise<Result<DoctorResult>>
  lockVerify: (write?: boolean) => Promise<Result<LockVerifyResult>>
}

function isBehind(drift: CatalogDriftResult | null): boolean {
  return drift?.status === "behind"
}

/**
 * Lightweight hook for the Team tab badge in layout.
 */
export function useCatalogDriftBadge(): boolean {
  const { settings } = useDb()
  const [behind, setBehind] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const teamRoot = settings.get<string>("team.root", "")
      const linkedProject = settings.get<string>("team.linkedProject", "")
      const profile = settings.get<string>("team.lastProfile", "")

      const ctxResult = await resolveTeamContext({
        settings: {
          "team.root": teamRoot,
          "team.linkedProject": linkedProject,
          "team.lastProfile": profile,
        },
        profile: profile || undefined,
      })

      if (!ctxResult.ok || cancelled) return

      const driftResult = await checkCatalogDrift(ctxResult.data, { force: false })
      if (cancelled) return

      if (driftResult.ok) {
        setBehind(isBehind(driftResult.data))
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [settings])

  return behind
}

/**
 * Team workflows hook: context, drift, profiles, and actions.
 */
export function useTeam(): TeamState & TeamActions {
  const { settings } = useDb()

  const [loading, setLoading] = useState(true)
  const [context, setContext] = useState<TeamContext | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<string[]>([])
  const [profileSummaries, setProfileSummaries] = useState<Record<string, ProfileSummary>>({})
  const [selectedProfile, setSelectedProfile] = useState(
    () => settings.get<string>("team.lastProfile", "quant"),
  )
  const [drift, setDrift] = useState<CatalogDriftResult | null>(null)
  const [lastApply, setLastApply] = useState<LastApplyState | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [lastDoctor, setLastDoctor] = useState<DoctorResult | null>(null)
  const [lastApplyResult, setLastApplyResult] = useState<ApplyResult | null>(null)
  const [lastLockVerify, setLastLockVerify] = useState<LockVerifyResult | null>(null)
  const [lastActionError, setLastActionError] = useState<string | null>(null)

  const readSettingsInput = useCallback(() => ({
    settings: {
      "team.root": settings.get<string>("team.root", ""),
      "team.linkedProject": settings.get<string>("team.linkedProject", ""),
      "team.lastProfile": settings.get<string>("team.lastProfile", ""),
    },
    profile: selectedProfile || undefined,
  }), [settings, selectedProfile])

  const refreshDrift = useCallback(async (force = false) => {
    const input = readSettingsInput()
    const ctxResult = await resolveTeamContext(input)
    if (!ctxResult.ok) return

    const driftResult = await checkCatalogDrift(ctxResult.data, { force })
    if (driftResult.ok) {
      setDrift(driftResult.data)
    }
  }, [readSettingsInput])

  const refresh = useCallback(async () => {
    setLoading(true)
    setContextError(null)

    const input = readSettingsInput()
    const ctxResult = await resolveTeamContext(input)

    if (!ctxResult.ok) {
      setContext(null)
      setProfiles([])
      setContextError(ctxResult.error.message)
      setLoading(false)
      return
    }

    const ctx = {
      ...ctxResult.data,
      effectiveProfile: selectedProfile || ctxResult.data.effectiveProfile,
    }
    setContext(ctx)

    const profilesResult = await listProfiles(ctx)
    if (profilesResult.ok) {
      setProfiles(profilesResult.data)
      const summaries: Record<string, ProfileSummary> = {}
      for (const name of profilesResult.data) {
        const summary = await getProfileSummary(ctx, name)
        if (summary.ok) summaries[name] = summary.data
      }
      setProfileSummaries(summaries)
    } else {
      setProfiles([])
    }

    const applyState = await getLastApplyState()
    setLastApply(applyState)

    await refreshDrift(false)
    setLoading(false)
  }, [readSettingsInput, selectedProfile, refreshDrift])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selectProfile = useCallback((name: string) => {
    setSelectedProfile(name)
    settings.set("team.lastProfile", name)
  }, [settings])

  const apply = useCallback(async (opts?: { writeLock?: boolean; dryRun?: boolean }) => {
    if (!context) {
      return { ok: false as const, error: { code: "UNKNOWN" as const, message: "No team context" } }
    }

    setActionLoading(true)
    setLastActionError(null)

    const ctx = { ...context, effectiveProfile: selectedProfile }
    const result = await runApply(ctx, {
      profile: selectedProfile,
      writeLock: opts?.writeLock,
      dryRun: opts?.dryRun,
    })

    if (result.ok) {
      setLastApplyResult(result.data)
      setLastApply(await getLastApplyState())
    } else if (result.error.details && typeof result.error.details === "object") {
      setLastApplyResult(result.error.details as ApplyResult)
      setLastActionError(result.error.message)
    } else {
      setLastActionError(result.error.message)
    }

    setActionLoading(false)
    return result
  }, [context, selectedProfile])

  const doctor = useCallback(async () => {
    if (!context) {
      return { ok: false as const, error: { code: "UNKNOWN" as const, message: "No team context" } }
    }

    setActionLoading(true)
    setLastActionError(null)

    const ctx = { ...context, effectiveProfile: selectedProfile }
    const result = await runDoctor(ctx, { profile: selectedProfile })

    if (result.ok) {
      setLastDoctor(result.data)
    } else {
      setLastActionError(result.error.message)
    }

    setActionLoading(false)
    return result
  }, [context, selectedProfile])

  const lockVerify = useCallback(async (write = false) => {
    if (!context) {
      return { ok: false as const, error: { code: "UNKNOWN" as const, message: "No team context" } }
    }

    setActionLoading(true)
    setLastActionError(null)

    const result = await runLockVerify(context, { write })

    if (result.ok) {
      setLastLockVerify(result.data)
    } else if (result.error.details && typeof result.error.details === "object") {
      const details = result.error.details as {
        mismatches?: LockVerifyResult["mismatches"]
        updated?: boolean
      }
      setLastLockVerify({
        ok: false,
        mismatches: details.mismatches ?? [],
        mismatchCount: details.mismatches?.length ?? 0,
        updated: details.updated ?? false,
      })
      setLastActionError(result.error.message)
    } else {
      setLastActionError(result.error.message)
    }

    setActionLoading(false)
    return result
  }, [context])

  return {
    loading,
    context,
    contextError,
    profiles,
    profileSummaries,
    selectedProfile,
    drift,
    driftBehind: isBehind(drift),
    lastApply,
    actionLoading,
    lastDoctor,
    lastApplyResult,
    lastLockVerify,
    lastActionError,
    refresh,
    refreshDrift,
    selectProfile,
    apply,
    doctor,
    lockVerify,
  }
}