import { NavLink, useLocation } from "react-router-dom"
import { useEffect, useMemo, useState } from "react"
import { ThemeToggle } from "@skillgate/ui"
import { electronAPI } from "../lib/electron-api"
import { useI18n } from "../i18n"
import { AppBrand } from "./app-logo"

interface NavItem {
  to: string
  labelKey: "nav.library" | "nav.explore" | "nav.remote" | "nav.sources"
  icon: React.ReactNode
  badge?: number
  label?: string
}

const navItemDefs: Omit<NavItem, "label">[] = [
  {
    to: "/",
    labelKey: "nav.library",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    to: "/discover",
    labelKey: "nav.explore",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    to: "/servers",
    labelKey: "nav.remote",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" />
        <line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    ),
  },
  {
    to: "/scan-sources",
    labelKey: "nav.sources",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 7h18" />
        <path d="M6 12h12" />
        <path d="M10 17h4" />
      </svg>
    ),
  },
]

function navClass(isActive: boolean, compact: boolean) {
  const base = compact
    ? "relative flex items-center justify-center w-8 h-8 rounded-md transition-colors"
    : "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors"
  return isActive
    ? `${base} nav-item-active`
    : `${base} text-muted hover:text-foreground list-row-hover`
}

function CompactNavButton({ to, label = "", icon, badge }: NavItem) {
  return (
    <NavLink to={to} end={to === "/"} title={label} className={({ isActive }) => navClass(isActive, true)}>
      {icon}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-accent text-[8px] font-semibold text-white px-0.5">
          {badge}
        </span>
      )}
    </NavLink>
  )
}

function FullNavButton({ to, label, icon, badge }: NavItem) {
  return (
    <NavLink to={to} end={to === "/"} className={({ isActive }) => navClass(isActive, false)}>
      {icon}
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[10px] font-mono text-muted tabular-nums">{badge}</span>
      )}
    </NavLink>
  )
}

export function Sidebar() {
  const { t } = useI18n()
  const location = useLocation()
  const isHome = location.pathname === "/"
  const [serverCount, setServerCount] = useState(0)
  const [appVersion, setAppVersion] = useState("")

  useEffect(() => {
    electronAPI.serversCount().then(setServerCount).catch(() => {})
    electronAPI.appGetVersion().then(setAppVersion).catch(() => {})
  }, [])

  const enrichedNavItems = useMemo(
    () =>
      navItemDefs.map((item) => ({
        ...item,
        label: t(item.labelKey),
        badge: item.to === "/servers" ? serverCount : undefined,
      })),
    [serverCount, t],
  )

  if (isHome) {
    return (
      <aside className="w-[52px] flex-shrink-0 flex flex-col items-center bg-surface border-r border-border">
        <AppBrand compact />

        <nav className="flex flex-col items-center gap-0.5 px-1">
          {enrichedNavItems.map((item) => (
            <CompactNavButton key={item.to} {...item} />
          ))}
        </nav>

        <div className="mt-auto pb-3 flex flex-col items-center gap-0.5 px-1">
          <NavLink
            to="/settings"
            title={t("nav.settings")}
            className={({ isActive }) => navClass(isActive, true)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </NavLink>
          <div className="py-1">
            <ThemeToggle />
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-surface border-r border-border">
      <AppBrand version={appVersion || undefined} />

      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
        {enrichedNavItems.map((item) => (
          <FullNavButton key={item.to} {...item} />
        ))}
      </nav>

      <div className="px-2 py-3 border-t border-border flex flex-col gap-0.5">
        <NavLink to="/settings" className={({ isActive }) => navClass(isActive, false)}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          {t("nav.settings")}
        </NavLink>
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <span className="text-[11px] text-muted">{t("nav.theme")}</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}