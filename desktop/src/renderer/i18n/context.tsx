import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { electronAPI } from "../lib/electron-api"
import { en, type Messages } from "./messages/en"
import { zhCN } from "./messages/zh-CN"
import type { ServerStatus } from "../lib/server-status"

export type Locale = "en" | "zh-CN"

const LOCALE_KEY = "ui.locale"

const catalogs: Record<Locale, Messages> = {
  en,
  "zh-CN": zhCN,
}

function detectSystemLocale(): Locale {
  const lang = navigator.language?.toLowerCase() ?? "en"
  if (lang.startsWith("zh")) return "zh-CN"
  return "en"
}

function getNested(messages: Messages, key: string): string | undefined {
  let current: unknown = messages
  for (const part of key.split(".")) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === "string" ? current : undefined
}

export type TranslateParams = Record<string, string | number>

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template
  return Object.entries(params).reduce(
    (acc, [name, value]) => acc.replaceAll(`{{${name}}}`, String(value)),
    template,
  )
}

export function createTranslator(locale: Locale) {
  const messages = catalogs[locale]

  function t(key: string, params?: TranslateParams & { count?: number }): string {
    const count = params?.count
    let template: string | undefined

    if (count !== undefined) {
      const pluralKey = count === 1 ? key : `${key}_plural`
      template = getNested(messages, pluralKey) ?? getNested(messages, key)
    } else {
      template = getNested(messages, key)
    }

    if (!template) return key
    return interpolate(template, params)
  }

  return t
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: ReturnType<typeof createTranslator>
  messages: Messages
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectSystemLocale())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    electronAPI
      .settingsAll()
      .then((settings) => {
        if (cancelled) return
        const stored = settings[LOCALE_KEY]
        if (stored === "en" || stored === "zh-CN") {
          setLocaleState(stored)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    void electronAPI.settingsSet(LOCALE_KEY, next).catch(() => {})
  }, [])

  const messages = catalogs[locale]
  const t = useMemo(() => createTranslator(locale), [locale])

  useEffect(() => {
    document.documentElement.lang = locale === "zh-CN" ? "zh-CN" : "en"
    document.title = messages.app.windowTitle
  }, [locale, messages.app.windowTitle])

  const value = useMemo(
    () => ({ locale, setLocale, t, messages }),
    [locale, setLocale, t, messages],
  )

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-[12px] text-muted">
        {createTranslator(locale)("common.loadingView")}
      </div>
    )
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider")
  }
  return ctx
}

export function formatSkillListCount(
  t: ReturnType<typeof createTranslator>,
  count: number,
  target?: string | null,
): string {
  if (target) {
    return t("home.skillCountIn", { count, target })
  }
  return t("home.skillCount", { count })
}

export function formatServerStatus(
  t: ReturnType<typeof createTranslator>,
  status: ServerStatus,
): string {
  switch (status.kind) {
    case "syncFailed":
      return t("remote.statusSyncFailed")
    case "neverSynced":
      return t("remote.statusNeverSynced")
    case "pendingPush":
      return t("remote.statusPendingPush", {
        count: status.localCount ?? 0,
        pending: status.pendingPush ?? 0,
      })
    case "onlyOnRemote":
      return t("remote.statusOnlyOnRemote", {
        count: status.localCount ?? 0,
        onlyOnRemote: status.onlyOnRemote ?? 0,
      })
    case "inSync":
      return t("remote.statusInSync", { count: status.localCount ?? 0 })
    default:
      return ""
  }
}

export function formatRelativeTime(
  t: ReturnType<typeof createTranslator>,
  isoString: string | null,
): string {
  if (!isoString) return t("remote.timeNever")
  const now = Date.now()
  const then = new Date(isoString + "Z").getTime()
  const diff = now - then
  if (diff < 0) return t("remote.timeJustNow")
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return t("remote.timeJustNow")
  const mins = Math.floor(secs / 60)
  if (mins < 60) return t("remote.timeMinutesAgo", { count: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t("remote.timeHoursAgo", { count: hours })
  const days = Math.floor(hours / 24)
  return t("remote.timeDaysAgo", { count: days })
}