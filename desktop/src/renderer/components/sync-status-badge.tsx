import { useI18n } from "../i18n"
import type { SkillSyncStatusKind } from "../lib/server-status"
import type { SkillSourceKind } from "../lib/skill-source"
import { gitHostLabel } from "../lib/skill-source"

const syncStyles: Record<
  SkillSyncStatusKind,
  { className: string; labelKey: string }
> = {
  inSync: {
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    labelKey: "remote.skillStatus.inSync",
  },
  needsPush: {
    className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    labelKey: "remote.skillStatus.needsPush",
  },
  newLocal: {
    className: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    labelKey: "remote.skillStatus.newLocal",
  },
  onlyRemote: {
    className: "bg-zinc-500/10 text-muted border-border",
    labelKey: "remote.skillStatus.onlyRemote",
  },
}

export function SyncStatusBadge({ kind }: { kind: SkillSyncStatusKind }) {
  const { t } = useI18n()
  const style = syncStyles[kind]
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${style.className}`}
      title={t(style.labelKey)}
    >
      {t(style.labelKey)}
    </span>
  )
}

const sourceStyles: Record<
  SkillSourceKind,
  { className: string; labelKey: string }
> = {
  github: {
    className: "bg-violet-500/10 text-violet-300 border-violet-500/20",
    labelKey: "home.updateStatus.github",
  },
  git: {
    className: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    labelKey: "home.updateStatus.git",
  },
  localOnly: {
    className: "bg-zinc-500/10 text-muted border-border",
    labelKey: "home.updateStatus.localOnly",
  },
}

export function UpdateStatusBadge({
  kind,
  source,
}: {
  kind: SkillSourceKind
  source?: string
}) {
  const { t } = useI18n()
  const style = sourceStyles[kind]
  const host = kind === "git" ? gitHostLabel(source) : null
  const label =
    kind === "git" && host
      ? t("home.updateStatus.gitHost", { host })
      : t(style.labelKey)
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${style.className}`}
      title={label}
    >
      {label}
    </span>
  )
}