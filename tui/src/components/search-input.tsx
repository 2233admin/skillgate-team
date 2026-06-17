import { useStore, useDispatch } from "../store/context.js"
import { colors } from "../utils/colors.js"

interface SearchInputProps {
  /** Action type to dispatch on input change */
  filterAction?: "SET_INSTALLED_FILTER" | "SET_SEARCH_QUERY"
  /** Placeholder text */
  placeholder?: string
}

/**
 * Always-visible filter bar. Type to filter live when focused (/ to focus).
 * Shows current filter text even when the list pane has focus.
 */
export function SearchInput({
  filterAction = "SET_INSTALLED_FILTER",
  placeholder = "Filter skills…  (/ focus  Esc clear)",
}: SearchInputProps) {
  const state = useStore()
  const dispatch = useDispatch()

  const isFocused = state.focusedPane === "search"
  const currentValue =
    filterAction === "SET_INSTALLED_FILTER"
      ? state.installedFilter
      : state.searchQuery

  const dispatchValue = (value: string) => {
    if (filterAction === "SET_INSTALLED_FILTER") {
      dispatch({ type: "SET_INSTALLED_FILTER", filter: value })
    } else {
      dispatch({ type: "SET_SEARCH_QUERY", query: value })
    }
  }

  return (
    <box
      style={{
        height: 3,
        width: "100%",
        border: true,
        borderColor: isFocused ? colors.primary : colors.border,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: "row",
      }}
      title={isFocused ? "Filter" : "/ filter"}
    >
      <text fg={colors.textDim}>{isFocused ? "› " : "/ "}</text>
      <input
        placeholder={placeholder}
        focused={isFocused && !state.showHelp}
        onInput={(value: string) => dispatchValue(value)}
        onSubmit={((value: string) => {
          dispatchValue(value)
          dispatch({ type: "SET_FOCUSED_PANE", pane: "list" })
        }) as any}
      />
      {!isFocused && currentValue ? (
        <text fg={colors.textDim}> ({currentValue.length} chars)</text>
      ) : null}
    </box>
  )
}