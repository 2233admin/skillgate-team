import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { electronAPI } from "../lib/electron-api"
import { useI18n } from "../i18n"

type ActionKind = "apply" | "doctor" | "lockWrite" | null

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg animate-slide-down">
        <h2 className="mb-1 text-[14px] font-semibold text-foreground">{title}</h2>
        <p className="mb-5 text-[12px] text-muted whitespace-pre-wrap">{body}</p>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-[12px] text-muted transition-colors hover:text-foreground"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-1.5 text-[12px] font-medium transition-colors ${
              destructive
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-foreground text-background hover:opacity-90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function DriftBanner({
  drift,
  onRefresh,
  refreshing,
}: {
  drift: TeamDriftState | null
  onRefresh: () => void
  refreshing: boolean
}) {
  const { t } = useI18n()
  if (!drift || drift.status !== "behind") return null

  return (
    <div className="mb-6 flex items-start justify-between gap-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{t("team.driftBehindTitle")}</p>
        <p className="mt-1 text-[12px] text-muted">
          {t("team.driftBehindBody", {
            local: drift.localVersion ?? t("common.unknown"),
            remote: drift.remoteVersion ?? t("common.unknown"),
          })}
        </p>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-surface-hover disabled:opacity-40"
      >
        {refreshing ? t("common.checking") : t("team.refreshDrift")}
      </button>
    </div>
  )
}

export function Team() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [context, setContext] = useState<TeamContext | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<string[]>([])
  const [selectedProfile, setSelectedProfile] = useState("")
  const [profileSummary, setProfileSummary] = useState<TeamProfileSummary | null>(null)
  const [drift, setDrift] = useState<TeamDriftState | null>(null)
  const [lastApply, setLastApply] = useState<TeamLastApplyState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [refreshingDrift, setRefreshingDrift] = useState(false)
  const [pendingAction, setPendingAction] = useState<ActionKind>(null)
  const [doctorResult, setDoctorResult] = useState<TeamDoctorResult | null>(null)
  const [lockResult, setLockResult] = useState<TeamLockVerifyResult | null>(null)
  const [applyResult, setApplyResult] = useState<TeamApplyResult | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadTeamData = useCallback(async () => {
    setLoading(true)
    setContextError(null)
    try {
      const [ctxRes, driftState, lastState] = await Promise.all([
        electronAPI.teamGetContext(),
        electronAPI.teamGetDriftState(),
        electronAPI.teamGetLastApplyState(),
      ])

      if (!ctxRes.ok) {
        setContext(null)
        setContextError(ctxRes.error.message)
        setProfiles([])
        setSelectedProfile("")
        setProfileSummary(null)
      } else {
        setContext(ctxRes.data)
        const profileName = ctxRes.data.effectiveProfile
        setSelectedProfile(profileName)

        const listRes = await electronAPI.teamListProfiles()
        if (listRes.ok) {
          setProfiles(listRes.data)
        } else {
          setProfiles([])
        }

        const summaryRes = await electronAPI.teamGetProfileSummary(profileName)
        setProfileSummary(summaryRes.ok ? summaryRes.data : null)
      }

      setDrift(driftState)
      setLastApply(lastState.ok ? lastState.data : null)
    } catch (err) {
      setContextError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTeamData()
    const cleanup = electronAPI.onTeamDriftState((state) => {
      setDrift(state)
    })
    return cleanup
  }, [loadTeamData])

  useEffect(() => {
    if (!selectedProfile || contextError) return
    let cancelled = false
    electronAPI
      .teamGetProfileSummary(selectedProfile)
      .then((res) => {
        if (!cancelled) {
          setProfileSummary(res.ok ? res.data : null)
        }
      })
      .catch(() => {
        if (!cancelled) setProfileSummary(null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedProfile, contextError])

  const profileSourceLabel = useMemo(() => {
    if (!context) return ""
    const key = `team.profileSource.${context.profileSource}` as const
    return t(key)
  }, [context, t])

  async function handleProfileChange(name: string) {
    setSelectedProfile(name)
    setDoctorResult(null)
    setLockResult(null)
    setApplyResult(null)
    setActionError(null)
    await electronAPI.teamSetLastProfile(name)
  }

  async function refreshDrift(force = false) {
    setRefreshingDrift(true)
    try {
      await electronAPI.teamCatalogDrift({ force })
    } catch (err) {
      console.error("Failed to refresh catalog drift:", err)
    } finally {
      setRefreshingDrift(false)
    }
  }

  async function runDoctor() {
    setBusy("doctor")
    setActionError(null)
    try {
      const res = await electronAPI.teamDoctor({ profile: selectedProfile })
      if (!res.ok) {
        setActionError(res.error.message)
        setDoctorResult(null)
        return
      }
      setDoctorResult(res.data)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function runLockVerify(write: boolean) {
    setBusy(write ? "lockWrite" : "lockVerify")
    setActionError(null)
    try {
      const res = await electronAPI.teamLockVerify({
        write,
        profile: selectedProfile,
      })
      if (!res.ok) {
        setActionError(res.error.message)
        setLockResult(null)
        return
      }
      setLockResult(res.data)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function runApply() {
    setBusy("apply")
    setActionError(null)
    try {
      const res = await electronAPI.teamApply({ profile: selectedProfile })
      if (!res.ok) {
        setActionError(res.error.message)
        setApplyResult(null)
        return
      }
      setApplyResult(res.data)
      const lastRes = await electronAPI.teamGetLastApplyState()
      setLastApply(lastRes.ok ? lastRes.data : null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  function handleConfirmAction() {
    const action = pendingAction
    setPendingAction(null)
    if (action === "apply") void runApply()
    if (action === "doctor") void runDoctor()
    if (action === "lockWrite") void runLockVerify(true)
  }

  return (
    <div className="p-8">
      <h2 className="mb-1 text-xl font-bold text-foreground">{t("team.title")}</h2>
      <p className="mb-6 text-[12px] text-muted">{t("team.subtitle")}</p>

      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          {t("team.loading")}
        </div>
      ) : (
        <div className="max-w-2xl flex flex-col gap-6">
          <DriftBanner
            drift={drift}
            onRefresh={() => refreshDrift(true)}
            refreshing={refreshingDrift}
          />

          {contextError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-sm font-medium text-foreground">{t("team.contextErrorTitle")}</p>
              <p className="mt-1 text-[12px] text-muted">{contextError}</p>
              <p className="mt-3 text-[12px] text-muted">
                {t("team.contextErrorHint")}{" "}
                <Link to="/settings" className="text-accent hover:text-foreground">
                  {t("nav.settings")}
                </Link>
              </p>
            </div>
          ) : context ? (
            <>
              <section className="rounded-lg border border-border bg-surface p-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  {t("team.contextTitle")}
                </h3>
                <dl className="grid gap-2 text-[12px]">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">{t("team.teamRoot")}</dt>
                    <dd className="font-mono text-foreground text-right break-all">
                      {context.teamRoot}
                    </dd>
                  </div>
                  {context.linkedProject && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">{t("team.linkedProject")}</dt>
                      <dd className="font-mono text-foreground text-right break-all">
                        {context.linkedProject}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">{t("team.effectiveProfile")}</dt>
                    <dd className="text-foreground">{context.effectiveProfile}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">{t("team.profileSourceLabel")}</dt>
                    <dd className="text-foreground">{profileSourceLabel}</dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-lg border border-border bg-surface p-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  {t("team.profilePickerTitle")}
                </h3>
                <select
                  value={selectedProfile}
                  onChange={(e) => void handleProfileChange(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground focus:border-accent/40 focus:outline-none"
                >
                  {profiles.length === 0 ? (
                    <option value={selectedProfile}>{selectedProfile}</option>
                  ) : (
                    profiles.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))
                  )}
                </select>
                {profileSummary && (
                  <p className="mt-2 text-[11px] text-muted">
                    {profileSummary.description || t("team.noProfileDescription")} ·{" "}
                    {t("team.skillCount", { count: profileSummary.skillCount })}
                  </p>
                )}
              </section>

              <section className="rounded-lg border border-border bg-surface p-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  {t("team.actionsTitle")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setPendingAction("apply")}
                    disabled={busy !== null}
                    className="rounded-lg bg-foreground px-4 py-2 text-[12px] font-medium text-background hover:opacity-90 disabled:opacity-40"
                  >
                    {busy === "apply" ? t("team.applying") : t("team.applyProfile")}
                  </button>
                  <button
                    onClick={() => setPendingAction("doctor")}
                    disabled={busy !== null}
                    className="rounded-lg border border-border px-4 py-2 text-[12px] font-medium text-foreground hover:bg-surface-hover disabled:opacity-40"
                  >
                    {busy === "doctor" ? t("team.runningDoctor") : t("team.runDoctor")}
                  </button>
                  <button
                    onClick={() => void runLockVerify(false)}
                    disabled={busy !== null}
                    className="rounded-lg border border-border px-4 py-2 text-[12px] font-medium text-foreground hover:bg-surface-hover disabled:opacity-40"
                  >
                    {busy === "lockVerify"
                      ? t("team.verifyingLock")
                      : t("team.verifyLock")}
                  </button>
                  <button
                    onClick={() => setPendingAction("lockWrite")}
                    disabled={busy !== null}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px] font-medium text-amber-100 hover:bg-amber-500/20 disabled:opacity-40"
                  >
                    {busy === "lockWrite"
                      ? t("team.writingLock")
                      : t("team.writeLock")}
                  </button>
                  <button
                    onClick={() => refreshDrift(true)}
                    disabled={refreshingDrift}
                    className="rounded-lg border border-border px-4 py-2 text-[12px] font-medium text-muted hover:text-foreground disabled:opacity-40"
                  >
                    {refreshingDrift ? t("common.checking") : t("team.refreshDrift")}
                  </button>
                </div>
              </section>

              {actionError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-300">
                  {actionError}
                </div>
              )}

              {applyResult && (
                <section className="rounded-lg border border-border bg-surface p-4">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    {t("team.applyResultTitle")}
                  </h3>
                  <p className="text-[12px] text-muted">
                    {t("team.applyResultSummary", {
                      installed: applyResult.installed,
                      failed: applyResult.failed,
                      method: applyResult.method,
                    })}
                  </p>
                  {applyResult.results.some((r) => !r.success) && (
                    <ul className="mt-2 max-h-40 overflow-y-auto text-[11px] text-red-300">
                      {applyResult.results
                        .filter((r) => !r.success)
                        .map((r) => (
                          <li key={`${r.skill}-${r.agent}`}>
                            {r.skill} / {r.agent}: {r.error}
                          </li>
                        ))}
                    </ul>
                  )}
                </section>
              )}

              {doctorResult && (
                <section className="rounded-lg border border-border bg-surface p-4">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    {t("team.doctorResultTitle")}
                  </h3>
                  <p className="text-[12px] text-muted">
                    {doctorResult.ok
                      ? t("team.doctorOk")
                      : t("team.doctorDrifts", { count: doctorResult.drifts.length })}
                  </p>
                  {doctorResult.drifts.length > 0 && (
                    <ul className="mt-2 max-h-48 overflow-y-auto text-[11px] text-muted">
                      {doctorResult.drifts.map((d) => (
                        <li key={`${d.skill}-${d.kind}-${d.agent ?? ""}`}>
                          {d.skill} · {d.kind}
                          {d.agent ? ` · ${d.agent}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {lockResult && (
                <section className="rounded-lg border border-border bg-surface p-4">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    {t("team.lockResultTitle")}
                  </h3>
                  <p className="text-[12px] text-muted">
                    {lockResult.ok
                      ? t("team.lockOk")
                      : t("team.lockMismatches", { count: lockResult.mismatchCount })}
                    {lockResult.updated ? ` · ${t("team.lockUpdated")}` : ""}
                  </p>
                  {lockResult.mismatches.length > 0 && (
                    <ul className="mt-2 max-h-48 overflow-y-auto text-[11px] text-muted">
                      {lockResult.mismatches.map((m) => (
                        <li key={m.skill}>
                          {m.skill}: lock={m.lockHash ?? "—"} disk={m.diskHash}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {lastApply && (
                <section className="rounded-lg border border-border bg-surface p-4">
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    {t("team.lastApplyTitle")}
                  </h3>
                  <dl className="grid gap-1 text-[12px]">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">{t("team.lastApplyProfile")}</dt>
                      <dd>{lastApply.profile}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">{t("team.lastApplyAt")}</dt>
                      <dd>{lastApply.appliedAt}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">{t("team.lastApplyMethod")}</dt>
                      <dd>{lastApply.method}</dd>
                    </div>
                  </dl>
                </section>
              )}
            </>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={pendingAction === "apply"}
        title={t("team.confirmApplyTitle")}
        body={t("team.confirmApplyBody", { profile: selectedProfile })}
        confirmLabel={t("team.applyProfile")}
        onConfirm={handleConfirmAction}
        onCancel={() => setPendingAction(null)}
      />

      <ConfirmDialog
        open={pendingAction === "doctor"}
        title={t("team.confirmDoctorTitle")}
        body={t("team.confirmDoctorBody", { profile: selectedProfile })}
        confirmLabel={t("team.runDoctor")}
        onConfirm={handleConfirmAction}
        onCancel={() => setPendingAction(null)}
      />

      <ConfirmDialog
        open={pendingAction === "lockWrite"}
        title={t("team.confirmLockWriteTitle")}
        body={t("team.confirmLockWriteBody")}
        confirmLabel={t("team.writeLock")}
        destructive
        onConfirm={handleConfirmAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  )
}