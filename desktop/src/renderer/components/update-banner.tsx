import { useState, useEffect } from "react"
import { electronAPI } from "../lib/electron-api"
import { useI18n } from "../i18n"

export function UpdateBanner() {
  const { t } = useI18n()
  const [state, setState] = useState<UpdateState | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    electronAPI.updatesGetState().then(setState).catch(() => {})
    const cleanup = electronAPI.onUpdateState((s) => {
      setState(s)
      if (s.status === "available" || s.status === "downloaded") {
        setDismissed(false)
      }
    })
    return cleanup
  }, [])

  if (dismissed || !state) return null

  if (state.status === "downloaded") {
    return (
      <div className="flex items-center justify-between px-4 py-2.5 bg-accent/10 border-b border-accent/20 text-[12px]">
        <span className="text-foreground">
          {t("update.ready", { version: state.downloadedVersion ?? "" })}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDismissed(true)}
            className="text-muted hover:text-foreground transition-colors px-2 py-1"
          >
            {t("common.later")}
          </button>
          <button
            onClick={() => electronAPI.updatesInstall()}
            className="bg-foreground text-background px-3 py-1 rounded-md hover:opacity-90 transition-opacity font-medium"
          >
            {t("update.restart")}
          </button>
        </div>
      </div>
    )
  }

  if (state.status === "available" || state.status === "downloading") {
    return (
      <div className="flex items-center justify-between px-4 py-2.5 bg-accent/10 border-b border-accent/20 text-[12px]">
        <span className="text-foreground">
          {t("update.downloading", { version: state.availableVersion ?? "" })}
          {state.progressPercent != null && (
            <span className="text-muted ml-2">
              {Math.round(state.progressPercent)}%
            </span>
          )}
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted hover:text-foreground transition-colors px-2 py-1"
        >
          {t("common.dismiss")}
        </button>
      </div>
    )
  }

  return null
}