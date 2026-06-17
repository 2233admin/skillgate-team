import { useState, useEffect, useMemo } from "react"
import { useKeyboard } from "@opentui/react"
import { useStore, useDispatch } from "../store/context.js"
import { useSearch } from "../data/use-search.js"
import { useTrending } from "../data/use-trending.js"
import { useSkillActions } from "../data/use-skill-actions.js"
import { ConfirmDialog } from "../components/confirm-dialog.js"
import { SearchInput } from "../components/search-input.js"
import type { CatalogSkill, SkillsShSkill } from "../data/api-client.js"
import { filterSkills } from "../data/api-client.js"
import { colors } from "../utils/colors.js"

// Sentinel selection index for the focusable "Official only" toggle row that
// sits above the skill rows in the list pane.
const TOGGLE_INDEX = -1

/**
 * Discover view: filter bar on top, two-column results + detail below.
 */
export function DiscoverView() {
  const state = useStore()
  const dispatch = useDispatch()
  const query = state.searchQuery
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [officialOnly, setOfficialOnly] = useState(false)
  const [installTarget, setInstallTarget] = useState<CatalogSkill | null>(null)
  const [previewSkill, setPreviewSkill] = useState<SkillsShSkill | null>(null)

  const { results, loading, error, total, hasMore, loadMore } =
    useSearch(query)
  const { trending, loading: trendingLoading } = useTrending()
  const { installSkill } = useSkillActions()

  const isSearching = query.trim().length >= 2

  const visibleSkills = useMemo<SkillsShSkill[]>(() => {
    let combined: SkillsShSkill[]
    if (!isSearching) {
      combined = trending
    } else {
      const local = filterSkills(trending, query)
      const seen = new Set(local.map((s) => s.id))
      const remote = results.filter((s) => !seen.has(s.id))
      combined = [...local, ...remote]
    }
    if (officialOnly) {
      combined = combined.filter((s) => s.isOfficial === true)
    }
    return combined
  }, [isSearching, query, trending, results, officialOnly])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    setSelectedIndex((i) => {
      if (i === TOGGLE_INDEX) return TOGGLE_INDEX
      return Math.min(Math.max(0, i), Math.max(0, visibleSkills.length - 1))
    })
  }, [visibleSkills.length])

  useEffect(() => {
    if (selectedIndex >= 0 && visibleSkills[selectedIndex]) {
      setPreviewSkill(visibleSkills[selectedIndex])
    } else {
      setPreviewSkill(null)
    }
  }, [selectedIndex, visibleSkills])

  useKeyboard((key) => {
    if (state.activeView !== "discover") return
    if (state.showHelp) return
    if (state.focusedPane === "search") return
    if (installTarget) return

    if (
      selectedIndex === TOGGLE_INDEX &&
      (key.name === "space" || key.name === "return")
    ) {
      setOfficialOnly((v) => !v)
      return
    }

    if (key.name === "up" || (key.name === "k" && !key.ctrl)) {
      setSelectedIndex((i) => Math.max(TOGGLE_INDEX, i - 1))
    }
    if (key.name === "down" || (key.name === "j" && !key.ctrl)) {
      setSelectedIndex((i) => {
        const next = Math.min(visibleSkills.length - 1, i + 1)
        if (isSearching && next >= visibleSkills.length - 3 && hasMore && !loading) {
          loadMore()
        }
        return next
      })
    }

    if (key.name === "g" && !key.shift) {
      setSelectedIndex(0)
    }
    if (key.name === "g" && key.shift) {
      setSelectedIndex(Math.max(0, visibleSkills.length - 1))
    }

    if (key.name === "v" && visibleSkills[selectedIndex]) {
      const skill = visibleSkills[selectedIndex]
      dispatch({
        type: "SELECT_SKILL",
        skill: catalogSkillToEnriched(skill),
      })
      return
    }

    if (key.name === "i" && visibleSkills[selectedIndex]) {
      setInstallTarget(visibleSkills[selectedIndex])
      return
    }
  })

  if (installTarget) {
    return (
      <ConfirmDialog
        message={`Install "${installTarget.name}"?`}
        onConfirm={async () => {
          const skill = catalogSkillToEnriched(installTarget)
          setInstallTarget(null)
          await installSkill(skill)
        }}
        onCancel={() => setInstallTarget(null)}
      />
    )
  }

  return (
    <box style={{ flexDirection: "column", width: "100%", flexGrow: 1 }}>
      <SearchInput
        filterAction="SET_SEARCH_QUERY"
        placeholder="Search catalog… (2+ chars for API)"
      />

      <box
        style={{
          height: 1,
          width: "100%",
          paddingLeft: 1,
          backgroundColor: colors.bgAlt,
          flexDirection: "row",
        }}
      >
        <text fg={colors.textDim}>
          {isSearching && loading
            ? "Loading…"
            : isSearching && error
              ? `Error: ${error}`
              : `${visibleSkills.length} ${isSearching ? "result" : "skill"}${visibleSkills.length !== 1 ? "s" : ""}`}
        </text>
      </box>

      <box style={{ flexDirection: "row", flexGrow: 1, width: "100%" }}>
        <box
          style={{
            width: "42%",
            border: true,
            borderColor: state.focusedPane === "list" ? colors.primary : colors.border,
            flexDirection: "column",
          } as any}
        >
          <box style={{ height: 1, paddingLeft: 1, backgroundColor: colors.bgAlt }}>
            <text fg={colors.textDim}>{isSearching ? "Results" : "Trending"}</text>
          </box>

          <box
            style={{
              height: 1,
              width: "100%",
              paddingLeft: 1,
              paddingRight: 1,
              flexDirection: "row",
              backgroundColor:
                selectedIndex === TOGGLE_INDEX ? colors.bgAlt : "transparent",
            }}
          >
            <text
              fg={selectedIndex === TOGGLE_INDEX ? colors.primary : colors.textDim}
            >
              {officialOnly ? "[x]" : "[ ]"} Official only
            </text>
          </box>

          {!isSearching && trendingLoading && trending.length === 0 ? (
            <box style={{ padding: 1 }}>
              <text fg={colors.textDim}>Loading popular skills…</text>
            </box>
          ) : visibleSkills.length === 0 && !(isSearching && loading) ? (
            <box style={{ padding: 1 }}>
              <text fg={colors.textDim}>
                {isSearching
                  ? "No skills found matching your query."
                  : "No skills available in the catalog."}
              </text>
            </box>
          ) : (
            <scrollbox
              focused={state.activeView === "discover" && state.focusedPane === "list" && !state.showHelp}
              style={{
                width: "100%",
                flexGrow: 1,
                rootOptions: { backgroundColor: colors.bg },
                viewportOptions: { backgroundColor: colors.bg },
                contentOptions: { backgroundColor: colors.bg },
                scrollbarOptions: {
                  trackOptions: {
                    foregroundColor: colors.primary,
                    backgroundColor: colors.border,
                  },
                },
              }}
            >
              {visibleSkills.map((skill, i) => (
                <box
                  key={skill.id ?? `${skill.skillId}-${i}`}
                  style={{
                    width: "100%",
                    paddingLeft: 1,
                    paddingRight: 1,
                    flexDirection: "row",
                    backgroundColor: i === selectedIndex ? colors.bgAlt : "transparent",
                  }}
                >
                  {skill.isOfficial ? (
                    <text fg={colors.primary}>{"✓ "}</text>
                  ) : null}
                  <text fg={i === selectedIndex ? colors.primary : colors.text}>
                    {skill.name}
                  </text>
                </box>
              ))}
              {isSearching && hasMore && (
                <box style={{ paddingLeft: 1, height: 1 }}>
                  <text fg={colors.textDim}>
                    {loading ? "Loading more…" : "Scroll down to load more…"}
                  </text>
                </box>
              )}
            </scrollbox>
          )}
        </box>

        <box style={{ flexGrow: 1, flexDirection: "column" }}>
          {previewSkill ? (
            <DiscoverDetailPanel skill={previewSkill} />
          ) : (
            <box style={{ padding: 1 }}>
              <text fg={colors.textDim}>Select a skill to view details</text>
            </box>
          )}
        </box>
      </box>
    </box>
  )
}

interface DiscoverDetailPanelProps {
  skill: CatalogSkill
}

function DiscoverDetailPanel({ skill }: DiscoverDetailPanelProps) {
  return (
    <scrollbox
      focused={false}
      style={{
        width: "100%",
        flexGrow: 1,
        rootOptions: { backgroundColor: colors.bg },
        viewportOptions: { backgroundColor: colors.bg },
        contentOptions: { backgroundColor: colors.bg },
        scrollbarOptions: {
          trackOptions: {
            foregroundColor: colors.primary,
            backgroundColor: colors.border,
          },
        },
      }}
    >
      <box style={{ paddingLeft: 1, paddingRight: 1, flexDirection: "column" }}>
        <text fg={colors.primary}>
          <strong>{skill.name}</strong>
        </text>

        <box style={{ flexDirection: "row", height: 1 }}>
          <text fg={colors.textDim}>ID: </text>
          <text fg={colors.text}>{skill.skillId}</text>
        </box>

        {skill.source ? (
          <box style={{ flexDirection: "row", height: 1 }}>
            <text fg={colors.textDim}>Source: </text>
            <text fg={colors.primary}>{skill.source}</text>
          </box>
        ) : null}

        <box style={{ flexDirection: "row", height: 1 }}>
          <text fg={colors.textDim}>Installs: </text>
          <text fg={colors.success}>{skill.installs.toLocaleString()}</text>
        </box>

        <text>{" "}</text>
        <text fg={colors.textDim}>v=full detail  i=install  /=search</text>
      </box>
    </scrollbox>
  )
}

function catalogSkillToEnriched(skill: CatalogSkill): import("../store/types.js").EnrichedSkill {
  const githubUrl = skill.source ? `https://github.com/${skill.source}` : undefined

  return {
    name: skill.name,
    description: "",
    filePath: "",
    canonicalPath: "",
    agents: [],
    scope: "custom",
    projectName: null,
    hasSupportingFiles: false,
    supportingFiles: [],
    metadata: {
      source: skill.source,
      skillId: skill.skillId,
      installs: skill.installs,
    },
    lock: skill.source
      ? {
          source: skill.source,
          sourceType: "github" as const,
          originalUrl: githubUrl ?? "",
          skillFolderHash: "",
          installedAt: "",
          updatedAt: "",
        }
      : undefined,
  }
}