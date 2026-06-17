import { useState, useEffect, useCallback } from "react"
import { electronAPI } from "../lib/electron-api"
import { useI18n, type Locale } from "../i18n"

// ---------------------------------------------------------------------------
// Setting row components
// ---------------------------------------------------------------------------

function SettingSelect({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string
  description: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
      <div>
        <p className="text-sm text-foreground">{label}</p>
        <p className="text-[11px] text-muted">{description}</p>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded bg-background border border-border text-[11px] text-foreground focus:outline-none focus:border-accent/40 transition-colors cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function SettingTextInput({
  label,
  description,
  value,
  placeholder,
  error,
  onChange,
}: {
  label: string
  description: string
  value: string
  placeholder?: string
  error?: string | null
  onChange: (value: string) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-sm text-foreground">{label}</p>
      <p className="text-[11px] text-muted mb-2">{description}</p>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border bg-background px-3 py-2 text-[12px] font-mono text-foreground placeholder:text-muted focus:outline-none focus:border-accent/40 transition-colors ${
          error ? "border-red-500/50" : "border-border"
        }`}
      />
      {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
    </div>
  )
}

function SettingToggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
      <div>
        <p className="text-sm text-foreground">{label}</p>
        <p className="text-[11px] text-muted">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          value ? "bg-foreground" : "bg-border"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform ${
            value ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

export function Settings() {
  const { t, locale, setLocale } = useI18n()
  // SQLite-backed settings
  const [installScope, setInstallScope] = useState("global")
  const [installMethod, setInstallMethod] = useState("symlink")
  const [searchPreference, setSearchPreference] = useState("semantic")
  const [telemetryEnabled, setTelemetryEnabled] = useState(true)
  const [customScanPaths, setCustomScanPaths] = useState<string[]>([])
  const [newScanPath, setNewScanPath] = useState("")
  const [defaultAgents, setDefaultAgents] = useState<string[]>([])
  const [mirrorAgents, setMirrorAgents] = useState<string[]>([])
  const [detectedAgents, setDetectedAgents] = useState<DetectedAgent[]>([])
  const [appVersion, setAppVersion] = useState("")
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [teamRoot, setTeamRoot] = useState("")
  const [linkedProject, setLinkedProject] = useState("")
  const [teamRootError, setTeamRootError] = useState<string | null>(null)
  const [linkedProjectError, setLinkedProjectError] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    try {
      const all = await electronAPI.settingsAll()
      if (all["install.scope"]) setInstallScope(all["install.scope"] as string)
      if (all["install.method"])
        setInstallMethod(all["install.method"] as string)
      if (all["search.preferSemantic"] !== undefined)
        setSearchPreference(
          all["search.preferSemantic"] ? "semantic" : "keyword",
        )
      if (all["telemetry.enabled"] !== undefined)
        setTelemetryEnabled(all["telemetry.enabled"] as boolean)
      if (Array.isArray(all["scan.customPaths"]))
        setCustomScanPaths(all["scan.customPaths"] as string[])
      if (Array.isArray(all["install.defaultAgents"]))
        setDefaultAgents(all["install.defaultAgents"] as string[])
      if (Array.isArray(all["sync.mirrorAgents"]))
        setMirrorAgents(all["sync.mirrorAgents"] as string[])
      if (typeof all["team.root"] === "string") setTeamRoot(all["team.root"] as string)
      if (typeof all["team.linkedProject"] === "string")
        setLinkedProject(all["team.linkedProject"] as string)
    } catch (err) {
      console.error("Failed to load settings:", err)
    } finally {
      setSettingsLoaded(true)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    electronAPI.detectAgents().then(setDetectedAgents).catch(() => {})
    electronAPI.appGetVersion().then(setAppVersion).catch(() => {})
    electronAPI.updatesGetState().then(setUpdateState).catch(() => {})
    const cleanup = electronAPI.onUpdateState((state) => {
      setUpdateState(state)
      setCheckingUpdates(state.status === "checking" || state.status === "downloading")
    })
    return cleanup
  }, [])

  async function saveSetting(key: string, value: unknown) {
    try {
      await electronAPI.settingsSet(key, value)
    } catch (err) {
      console.error("Failed to save setting:", err)
    }
  }

  async function validatePathSetting(
    value: string,
    required: boolean,
  ): Promise<string | null> {
    const trimmed = value.trim()
    if (!trimmed) {
      return required ? t("settings.teamPathRequired") : null
    }
    if (trimmed.includes("\0")) {
      return t("settings.teamPathInvalid")
    }
    return null
  }

  async function handleTeamRootChange(value: string) {
    setTeamRoot(value)
    const error = await validatePathSetting(value, false)
    setTeamRootError(error)
    if (!error) {
      await saveSetting("team.root", value.trim())
    }
  }

  async function handleLinkedProjectChange(value: string) {
    setLinkedProject(value)
    const error = await validatePathSetting(value, false)
    setLinkedProjectError(error)
    if (!error) {
      await saveSetting("team.linkedProject", value.trim())
    }
  }

  function toggleAgentSelection(
    current: string[],
    setCurrent: (value: string[]) => void,
    key: "install.defaultAgents" | "sync.mirrorAgents",
    value: string,
  ) {
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]
    setCurrent(next)
    saveSetting(key, next)
  }

  async function handleCheckUpdates() {
    setCheckingUpdates(true)
    try {
      const state = await electronAPI.updatesCheck()
      setUpdateState(state)
    } catch (err) {
      console.error("Failed to check updates:", err)
    } finally {
      setCheckingUpdates(false)
    }
  }

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-foreground mb-1">{t("settings.title")}</h2>
      <p className="text-[12px] text-muted mb-6">{t("settings.subtitle")}</p>

      <div className="flex flex-col gap-6 max-w-lg">
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {t("settings.appearance")}
          </h3>
          <div className="flex flex-col gap-3">
            <SettingSelect
              label={t("settings.language")}
              description={t("settings.languageDescription")}
              value={locale}
              options={[
                { value: "en", label: t("settings.languageEn") },
                { value: "zh-CN", label: t("settings.languageZh") },
              ]}
              onChange={(v) => setLocale(v as Locale)}
            />
          </div>
        </section>

        {/* Team workflows */}
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {t("settings.team")}
          </h3>
          <div className="flex flex-col gap-3">
            {settingsLoaded ? (
              <>
                <SettingTextInput
                  label={t("settings.teamRoot")}
                  description={t("settings.teamRootDescription")}
                  value={teamRoot}
                  placeholder={t("settings.teamRootPlaceholder")}
                  error={teamRootError}
                  onChange={(v) => void handleTeamRootChange(v)}
                />
                <SettingTextInput
                  label={t("settings.linkedProject")}
                  description={t("settings.linkedProjectDescription")}
                  value={linkedProject}
                  placeholder={t("settings.linkedProjectPlaceholder")}
                  error={linkedProjectError}
                  onChange={(v) => void handleLinkedProjectChange(v)}
                />
              </>
            ) : (
              <div className="p-3 rounded-lg border border-border bg-surface">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              </div>
            )}
          </div>
        </section>

        {/* Install preferences */}
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {t("settings.installation")}
          </h3>
          <div className="flex flex-col gap-3">
            {settingsLoaded ? (
              <>
                <SettingSelect
                  label={t("settings.defaultScope")}
                  description={t("settings.defaultScopeDescription")}
                  value={installScope}
                  options={[
                    { value: "global", label: t("settings.scopeGlobal") },
                    { value: "project", label: t("settings.scopeProject") },
                  ]}
                  onChange={(v) => {
                    setInstallScope(v)
                    saveSetting("install.scope", v)
                  }}
                />
                <SettingSelect
                  label={t("settings.installMethod")}
                  description={t("settings.installMethodDescription")}
                  value={installMethod}
                  options={[
                    { value: "symlink", label: t("settings.methodSymlink") },
                    { value: "copy", label: t("settings.methodCopy") },
                  ]}
                  onChange={(v) => {
                    setInstallMethod(v)
                    saveSetting("install.method", v)
                  }}
                />
              </>
            ) : (
              <div className="p-3 rounded-lg border border-border bg-surface">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              </div>
            )}
          </div>
        </section>

        {/* Search preferences */}
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {t("settings.search")}
          </h3>
          <div className="flex flex-col gap-3">
            {settingsLoaded && (
              <SettingSelect
                label={t("settings.searchPreference")}
                description={t("settings.searchPreferenceDescription")}
                value={searchPreference}
                options={[
                  { value: "semantic", label: t("settings.searchSemantic") },
                  { value: "keyword", label: t("settings.searchKeyword") },
                ]}
                onChange={(v) => {
                  setSearchPreference(v)
                  saveSetting("search.preferSemantic", v === "semantic")
                }}
              />
            )}
          </div>
        </section>

        {/* Privacy */}
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {t("settings.privacy")}
          </h3>
          <div className="flex flex-col gap-3">
            {settingsLoaded && (
              <SettingToggle
                label={t("settings.telemetry")}
                description={t("settings.telemetryDescription")}
                value={telemetryEnabled}
                onChange={(v) => {
                  setTelemetryEnabled(v)
                  saveSetting("telemetry.enabled", v)
                }}
              />
            )}
          </div>
        </section>

        {/* Updates */}
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {t("settings.updates")}
          </h3>
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-foreground">{t("settings.desktopUpdates")}</p>
                <p className="text-[11px] text-muted mt-1">
                  {t("settings.versionLabel", {
                    version: appVersion || t("common.unknown"),
                  })}
                </p>
                <p className="text-[11px] text-muted mt-2">
                  {updateState?.message || t("settings.checkUpdatesHint")}
                </p>
                {updateState?.availableVersion && (
                  <p className="text-[11px] text-foreground mt-1">
                    {t("settings.latestAvailable", {
                      version: updateState.availableVersion,
                    })}
                  </p>
                )}
                {typeof updateState?.progressPercent === "number" && (
                  <p className="text-[11px] text-muted mt-1">
                    {t("settings.downloadProgress", {
                      percent: Math.round(updateState.progressPercent),
                    })}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleCheckUpdates}
                  disabled={checkingUpdates}
                  className="rounded-lg border border-border px-4 py-2 text-[12px] font-medium text-foreground hover:bg-surface-hover disabled:opacity-40"
                >
                  {checkingUpdates ? t("common.checking") : t("common.checkNow")}
                </button>
                {updateState?.status === "downloaded" && (
                  <button
                    onClick={() => electronAPI.updatesInstall()}
                    className="rounded-lg bg-foreground px-4 py-2 text-[12px] font-medium text-background"
                  >
                    {t("settings.restartToInstall")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Scan paths */}
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {t("settings.scanPaths")}
          </h3>
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-sm text-foreground mb-1">
                {t("settings.customScanDirectories")}
              </p>
              <p className="text-[11px] text-muted mb-3">
                {t("settings.customScanDescription")}
              </p>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newScanPath}
                  onChange={(e) => setNewScanPath(e.target.value)}
                  placeholder={t("settings.scanPathPlaceholder")}
                  className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-[12px] text-foreground placeholder:text-muted focus:outline-none focus:border-accent/40 transition-colors font-mono"
                />
                <button
                  onClick={() => {
                    const value = newScanPath.trim()
                    if (!value || customScanPaths.includes(value)) return
                    const next = [...customScanPaths, value]
                    setCustomScanPaths(next)
                    setNewScanPath("")
                    saveSetting("scan.customPaths", next)
                  }}
                  className="px-3 py-2 rounded-lg bg-foreground text-background text-[12px] font-medium"
                >
                  {t("common.add")}
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {customScanPaths.length === 0 ? (
                  <p className="text-[11px] text-muted">{t("settings.noCustomScanPaths")}</p>
                ) : (
                  customScanPaths.map((scanPath) => (
                    <div key={scanPath} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <code className="text-[11px] text-foreground">{scanPath}</code>
                      <button
                        onClick={() => {
                          const next = customScanPaths.filter((item) => item !== scanPath)
                          setCustomScanPaths(next)
                          saveSetting("scan.customPaths", next)
                        }}
                        className="text-[11px] text-red-400 hover:text-red-300"
                      >
                        {t("common.remove")}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Target defaults */}
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {t("settings.defaultTargets")}
          </h3>
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className="text-sm text-foreground mb-1">{t("settings.installTargets")}</p>
            <p className="text-[11px] text-muted mb-3">
              {t("settings.installTargetsDescription")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {detectedAgents.map((agent) => (
                <label key={agent.name} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[12px] text-foreground">
                  <input
                    type="checkbox"
                    checked={defaultAgents.includes(agent.name)}
                    onChange={() =>
                      toggleAgentSelection(defaultAgents, setDefaultAgents, "install.defaultAgents", agent.name)
                    }
                  />
                  <span>{agent.displayName}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Sync rules */}
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {t("settings.syncRules")}
          </h3>
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className="text-sm text-foreground mb-1">{t("settings.mirrorInstalls")}</p>
            <p className="text-[11px] text-muted mb-3">
              {t("settings.mirrorDescription")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {detectedAgents.map((agent) => (
                <label key={agent.name} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[12px] text-foreground">
                  <input
                    type="checkbox"
                    checked={mirrorAgents.includes(agent.name)}
                    onChange={() =>
                      toggleAgentSelection(mirrorAgents, setMirrorAgents, "sync.mirrorAgents", agent.name)
                    }
                  />
                  <span>{agent.displayName}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* About */}
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3">{t("settings.about")}</h3>
          <div className="p-3 rounded-lg border border-border bg-surface">
            <p className="text-sm text-foreground">
              {t("settings.aboutVersion", { version: appVersion || "0.6.0" })}
            </p>
            <p className="text-[11px] text-muted mt-1">
              {t("settings.aboutDescription")}
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
