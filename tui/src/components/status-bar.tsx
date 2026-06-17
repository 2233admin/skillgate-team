import { useStore } from "../store/context.js"
import { colors } from "../utils/colors.js"
import { agents } from "../../../cli/src/core/agents.js"

function filterLabel(filter: string): string {
  if (filter === "all") return "All"
  if (filter === "favorites") return "Favorites"
  return agents[filter as keyof typeof agents]?.displayName ?? filter
}

export function StatusBar() {
  const state = useStore()

  const skillCount = state.installedSkills.length
  const agentCount = state.detectedAgents.length

  let hints = ""

  if (state.showHelp) {
    hints = "Esc/? close help"
  } else if (state.activeView === "detail") {
    hints = "q/Esc back  e=edit  o=open  d=remove"
  } else if (state.activeView === "home") {
    if (state.focusedPane === "search") {
      hints = "type=filter  Enter=list  Esc=clear  Tab=list"
    } else {
      hints = "j/k nav  v detail  f fav  d/u remove/update  [/]=filter  /=search  n=create  c=collections  r=refresh"
    }
  } else if (state.activeView === "discover") {
    if (state.focusedPane === "search") {
      hints = "type=search  Enter=list  Esc=clear  Tab=list"
    } else {
      hints = "j/k nav  v detail  i install  space=toggle official  /=search"
    }
  } else if (state.activeView === "servers") {
    hints = "j/k nav  a=add  e=edit  S=sync  P=push  t=test"
  } else if (state.activeView === "settings") {
    hints = "Esc back"
  } else {
    hints = "Esc back"
  }

  const context =
    state.activeView === "home" && state.focusedPane === "list"
      ? ` · ${filterLabel(state.selectedAgentFilter)}`
      : ""

  const statusText = `Skills ${skillCount} · Agents ${agentCount}${context} · ${hints} · ?=help · 1/2/3 tabs · Ctrl+Q quit`

  return (
    <box
      style={{
        height: 1,
        width: "100%",
        backgroundColor: colors.statusBar,
        flexDirection: "row",
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text fg={colors.textDim}>{statusText}</text>
    </box>
  )
}