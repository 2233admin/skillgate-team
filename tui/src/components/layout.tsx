import { useState } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { useStore, useDispatch } from "../store/context.js"
import { useDb } from "../db/context.js"
import { useDetectedAgents } from "../data/use-agents.js"
import { useInstalledSkills } from "../data/use-installed-skills.js"
import { useFavorites } from "../data/use-favorites.js"
import { StatusBar } from "./status-bar.js"
import { HelpOverlay } from "./help-overlay.js"
import { HomeView } from "../views/home.js"
import { SkillDetailView } from "../views/skill-detail.js"
import { DiscoverView } from "../views/discover.js"
import { ServersView } from "../views/servers.js"
import { AddServerView } from "../views/add-server.js"
import { ServerSkillsView } from "../views/server-skills.js"
import { SettingsView } from "../views/settings.js"
import { TeamView } from "../views/team.js"
import { useCatalogDriftBadge } from "../data/use-team.js"
import { colors } from "../utils/colors.js"
import type { ViewName } from "../store/types.js"

function getTabOptions(serverCount: number, driftBehind: boolean) {
  return [
    { name: "Installed", description: "Locally installed skills", value: "home" },
    { name: "Discover", description: "Search the registry", value: "discover" },
    {
      name: serverCount > 0 ? `Servers (${serverCount})` : "Servers",
      description: "Remote SSH servers",
      value: "servers",
    },
    {
      name: driftBehind ? "Team *" : "Team",
      description: "Team profiles, apply, doctor",
      value: "team",
    },
  ]
}

export function Layout() {
  const state = useStore()
  const dispatch = useDispatch()
  const { width, height } = useTerminalDimensions()
  const { servers } = useDb()
  const [serverCount, setServerCount] = useState(() => servers.list().length)
  const driftBehind = useCatalogDriftBadge()

  // Load agent + skill data on mount
  useDetectedAgents()
  useInstalledSkills()
  useFavorites()

  // Global keyboard shortcuts
  useKeyboard((key) => {
    // Ctrl+Q always works -- clean exit
    if (key.name === "q" && key.ctrl) {
      const exit = (globalThis as any).__skillsgateTuiCleanExit
      if (exit) exit()
      else process.exit(0)
    }

    const activeView = state.activeView as string
    const inFormView = activeView === "detail" || activeView === "add-server"
      || activeView === "edit-server" || activeView === "settings"
      || activeView === "server-skills"

    // When filter bar is focused, only handle navigation / clear shortcuts
    if (state.focusedPane === "search") {
      if (key.name === "escape") {
        if (state.activeView === "home" && state.installedFilter) {
          dispatch({ type: "SET_INSTALLED_FILTER", filter: "" })
        } else if (state.activeView === "discover" && state.searchQuery) {
          dispatch({ type: "SET_SEARCH_QUERY", query: "" })
        } else {
          dispatch({ type: "SET_FOCUSED_PANE", pane: "list" })
        }
        return
      }
      if (key.name === "tab" && !key.shift) {
        dispatch({ type: "SET_FOCUSED_PANE", pane: "list" })
        return
      }
      return
    }

    // Help overlay toggle
    if (key.name === "?" || (key.shift && key.name === "/")) {
      dispatch({ type: "TOGGLE_HELP" })
      return
    }

    // Dismiss help with Esc
    if (state.showHelp && key.name === "escape") {
      dispatch({ type: "TOGGLE_HELP" })
      return
    }

    // When help is shown, block other shortcuts
    if (state.showHelp) return

    // Tab switching (only when not in detail/form views)
    if (!inFormView) {
      if (key.name === "1") dispatch({ type: "NAVIGATE", view: "home" })
      if (key.name === "2") dispatch({ type: "NAVIGATE", view: "discover" })
      if (key.name === "3") {
        setServerCount(servers.list().length)
        dispatch({ type: "NAVIGATE", view: "servers" })
      }
      if (key.name === "4") dispatch({ type: "NAVIGATE", view: "team" })
    }

    // "s" to open settings (not from discover/detail/form views)
    if (key.name === "s" && state.activeView !== "discover" && state.activeView !== "detail"
      && !inFormView) {
      dispatch({ type: "NAVIGATE", view: "settings" })
      return
    }

    // "/" to focus filter bar
    if (key.name === "/" && state.activeView !== "detail" && !inFormView
      && (state.activeView === "home" || state.activeView === "discover")) {
      dispatch({ type: "SET_FOCUSED_PANE", pane: "search" })
      return
    }

    // [ ] cycle library/agent filter on home (list focus)
    if (state.activeView === "home" && state.focusedPane === "list" && !inFormView) {
      if (key.name === "[" || key.name === "left") {
        dispatch({ type: "CYCLE_AGENT_FILTER", direction: "prev" })
        return
      }
      if (key.name === "]" || key.name === "right") {
        dispatch({ type: "CYCLE_AGENT_FILTER", direction: "next" })
        return
      }
    }

    // Esc: go back from sub-views, clear filter, return focus to list
    if (key.name === "escape") {
      if (state.activeView === "detail" || state.activeView === "add-server"
        || state.activeView === "edit-server" || state.activeView === "settings"
        || state.activeView === "server-skills") {
        dispatch({ type: "GO_BACK" })
        return
      }
      if (state.activeView === "home" && state.installedFilter) {
        dispatch({ type: "SET_INSTALLED_FILTER", filter: "" })
        return
      }
      if (state.activeView === "discover" && state.searchQuery) {
        dispatch({ type: "SET_SEARCH_QUERY", query: "" })
        return
      }
      if (state.focusedPane === "agents") {
        dispatch({ type: "SET_FOCUSED_PANE", pane: "list" })
      }
      return
    }

    // "r" to refresh installed skills
    if (key.name === "r" && activeView !== "detail" && state.activeView === "home") {
      dispatch({ type: "REFRESH_SKILLS" })
      return
    }
  })

  const TAB_OPTIONS = getTabOptions(serverCount, driftBehind)

  const activeTabIndex = TAB_OPTIONS.findIndex(
    (t) => t.value === state.activeView
  )

  return (
    <box
      style={{
        width: "100%",
        height: "100%",
        flexDirection: "column",
        backgroundColor: colors.bg,
      }}
    >
      {/* Header */}
      <box
        style={{
          height: 1,
          width: "100%",
          backgroundColor: colors.header,
          flexDirection: "row",
          paddingLeft: 1,
          paddingRight: 1,
          justifyContent: "space-between",
        }}
      >
        <text fg={colors.primary}>
          <strong>Skillgate TUI</strong> <span fg={colors.textDim}>v0.6.0-team.1</span>
        </text>
      </box>

      {/* Tab navigation */}
      <tab-select
        options={TAB_OPTIONS}
        focused={state.activeView !== "detail" && !state.showHelp}
        {...({ selectedIndex: activeTabIndex >= 0 ? activeTabIndex : 0 } as any)}
        selectedBackgroundColor={colors.tabActive}
        selectedTextColor={colors.tabText}
        textColor={colors.textDim}
        backgroundColor={colors.bg}
        showDescription={false}
        showUnderline={true}
        wrapSelection={true}
        onChange={(index: number) => {
          const view = TAB_OPTIONS[index]?.value as ViewName | undefined
          if (view) dispatch({ type: "NAVIGATE", view })
        }}
      />

      {/* Content area */}
      <box style={{ flexGrow: 1, width: "100%" }}>
        {state.showHelp ? (
          <HelpOverlay />
        ) : (
          <>
            {state.activeView === "home" && <HomeView />}
            {state.activeView === "discover" && <DiscoverView />}
            {state.activeView === "servers" && <ServersView onServerCountChange={setServerCount} />}
            {(state.activeView === "add-server" || state.activeView === "edit-server") && (
              <AddServerView
                editServerId={state.activeView === "edit-server" ? state.selectedServerId : null}
                onServerCountChange={setServerCount}
              />
            )}
            {state.activeView === "server-skills" && state.selectedServerId && (
              <ServerSkillsView serverId={state.selectedServerId} />
            )}
            {state.activeView === "settings" && <SettingsView />}
            {state.activeView === "team" && <TeamView />}
            {state.activeView === "detail" && state.selectedSkill && (
              <SkillDetailView />
            )}
          </>
        )}
      </box>

      {/* Notification bar (conditional) */}
      {state.notification && (
        <box
          style={{
            height: 1,
            width: "100%",
            backgroundColor:
              state.notification.type === "error"
                ? "#331111"
                : state.notification.type === "success"
                  ? "#113311"
                  : "#111133",
            paddingLeft: 1,
          }}
        >
          <text
            fg={
              state.notification.type === "error"
                ? colors.error
                : state.notification.type === "success"
                  ? colors.success
                  : colors.primary
            }
          >
            {state.notification.message}
          </text>
        </box>
      )}

      {/* Status bar */}
      <StatusBar />
    </box>
  )
}
