import { useEffect, useState } from "react"
import { electronAPI } from "../lib/electron-api"
import { useI18n } from "../i18n"

export function ScanSources() {
  const { t } = useI18n()
  const [paths, setPaths] = useState<string[]>([])
  const [newPath, setNewPath] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    electronAPI
      .settingsAll()
      .then((settings) => {
        setPaths((settings["scan.customPaths"] as string[]) || [])
      })
      .catch(() => {
        setPaths([])
      })
  }, [])

  async function persist(next: string[]) {
    setSaving(true)
    try {
      await electronAPI.settingsSet("scan.customPaths", next)
      setPaths(next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-4xl">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground mb-1">
            {t("sources.title")}
          </h2>
          <p className="text-[12px] text-muted">{t("sources.subtitle")}</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
            <div>
              <h3 className="text-[13px] font-semibold text-foreground mb-2">
                {t("sources.bringYourOwn")}
              </h3>
              <p className="text-[12px] text-muted leading-relaxed mb-4">
                {t("sources.pointAt")}
              </p>
              <div className="flex flex-col gap-2 text-[12px] text-foreground">
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  {t("sources.directFolders")}
                  <code className="ml-2 text-muted">
                    ~/my-skills/example/SKILL.md
                  </code>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  {t("sources.projectLocal")}
                  <code className="ml-2 text-muted">
                    ~/projects/app/.claude/skills/foo/SKILL.md
                  </code>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-[11px] uppercase tracking-widest text-muted mb-2">
                {t("sources.currentCoverage")}
              </p>
              <div className="flex flex-col gap-2">
                <div className="rounded-md border border-border px-3 py-2 text-[12px] text-foreground">
                  {t("sources.customSources", { count: paths.length })}
                </div>
                <div className="rounded-md border border-border px-3 py-2 text-[12px] text-foreground">
                  {t("sources.globalStillScanned")}
                </div>
                <div className="rounded-md border border-border px-3 py-2 text-[12px] text-foreground">
                  {t("sources.projectUnderRoot")}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-[13px] font-semibold text-foreground">
                {t("sources.customRoots")}
              </h3>
              <p className="text-[12px] text-muted">
                {t("sources.customRootsDescription")}
              </p>
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder={t("settings.scanPathPlaceholder")}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newPath.trim()) {
                  const value = newPath.trim()
                  if (!paths.includes(value)) {
                    void persist([...paths, value])
                  }
                  setNewPath("")
                }
              }}
            />
            <button
              onClick={() => {
                const value = newPath.trim()
                if (!value || paths.includes(value)) return
                void persist([...paths, value])
                setNewPath("")
              }}
              disabled={saving}
              className="rounded-lg bg-foreground px-4 py-2 text-[12px] font-medium text-background disabled:opacity-40"
            >
              {t("sources.addRoot")}
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {paths.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                <p className="text-[12px] text-muted">{t("sources.emptyRoots")}</p>
              </div>
            ) : (
              paths.map((scanPath) => (
                <div
                  key={scanPath}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3"
                >
                  <div>
                    <code className="block text-[12px] text-foreground">
                      {scanPath}
                    </code>
                    <p className="text-[11px] text-muted mt-1">
                      {t("sources.rootHint")}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      void persist(paths.filter((item) => item !== scanPath))
                    }
                    className="rounded-md border border-border px-3 py-1.5 text-[11px] text-red-400 hover:text-red-300 hover:bg-surface"
                  >
                    {t("common.remove")}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}