import { useEffect, useMemo, useRef, useState } from "react"
import type {
  AgentCatalogSelection,
  AppAPI,
  CatalogItem,
  CatalogKind,
  CatalogPlatform,
  CatalogScope,
  CatalogSummary,
  RootGrant,
} from "../lib/app-api"
import { AgentLaunchDialog } from "../agent/agent-launch-dialog"
import type { CatalogClient } from "../lib/catalog-client"
import type { FilesClient } from "../lib/files-client"
import { FileDetail, type FileSelection } from "../files/file-detail"
import { WorktreePanel } from "../files/worktree-panel"
import type { TerminalController } from "../terminal/terminal-controller"
import { TerminalWorkspace } from "../terminal/terminal-workspace"

const kinds: CatalogKind[] = ["skill", "agent", "rule", "context"]
const platforms: CatalogPlatform[] = ["shared", "codex", "claude", "cursor"]
const scopes: CatalogScope[] = ["global", "project"]

const emptySummary: CatalogSummary = {
  total: 0,
  byKind: { skill: 0, agent: 0, rule: 0, context: 0 },
  byPlatform: { shared: 0, codex: 0, claude: 0, cursor: 0 },
  byScope: { global: 0, project: 0 },
  projectNames: [],
}

function toggle<T>(value: T, selected: T[], setSelected: (next: T[]) => void) {
  setSelected(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])
}

export function CatalogPage({
  api,
  files,
  runtime,
}: {
  api: CatalogClient
  files?: FilesClient
  runtime?: { api: Pick<AppAPI, "agentLaunch">; terminals: TerminalController }
}) {
  const [grant, setGrant] = useState<RootGrant | null>(null)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [summary, setSummary] = useState(emptySummary)
  const [query, setQuery] = useState("")
  const [selectedKinds, setSelectedKinds] = useState<CatalogKind[]>([])
  const [selectedPlatforms, setSelectedPlatforms] = useState<CatalogPlatform[]>([])
  const [selectedScopes, setSelectedScopes] = useState<CatalogScope[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<FileSelection | null>(null)
  const [dirty, setDirty] = useState(false)
  const [launchAgent, setLaunchAgent] = useState<CatalogItem | null>(null)
  const requestGeneration = useRef(0)

  async function loadCatalog(force = false, source?: "home" | "picker") {
    if (source && dirty && !window.confirm("Discard unsaved changes and change the catalog root?")) return
    const generation = ++requestGeneration.current
    setLoading(true)
    setError(null)
    const selected = source
      ? await api.selectRoot(source)
      : grant ?? (await api.selectRoot("home"))
    if (generation !== requestGeneration.current) return
    if ("ok" in selected && !selected.ok) {
      setError(selected.error.message)
      setLoading(false)
      return
    }
    const nextGrant = "ok" in selected ? selected.data : selected
    if (!nextGrant) {
      setLoading(false)
      return
    }
    const rootChanged = nextGrant.grantId !== grant?.grantId
    setGrant(nextGrant)
    if (rootChanged) setSelection(null)
    const result = await api.scan(nextGrant.grantId, force)
    if (generation !== requestGeneration.current) return
    if (result.ok) {
      setItems(result.data.items)
      setSummary(result.data.summary)
      if (files && (rootChanged || !selection) && result.data.items[0]) setSelection(toFileSelection(result.data.items[0]))
    } else {
      setError(result.error.message)
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadCatalog()
    return () => { requestGeneration.current += 1 }
  }, [])

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return items.filter((item) => {
      if (selectedKinds.length && !selectedKinds.includes(item.kind)) return false
      if (selectedPlatforms.length && !selectedPlatforms.includes(item.platform)) return false
      if (selectedScopes.length && !selectedScopes.includes(item.scope)) return false
      return !needle || `${item.name} ${item.description} ${item.displayPath}`.toLocaleLowerCase().includes(needle)
    })
  }, [items, query, selectedKinds, selectedPlatforms, selectedScopes])
  const selectedItem = selection
    ? items.find((item) => item.location.grantId === selection.location.grantId && item.location.relativePath === selection.location.relativePath) ?? null
    : null

  function chooseSelection(next: FileSelection) {
    if (dirty && !window.confirm("Discard unsaved changes and open another file?")) return
    setSelection(next)
  }

  async function refreshAfterMutation() {
    if (!grant) return
    const generation = ++requestGeneration.current
    const result = await api.scan(grant.grantId, true)
    if (generation !== requestGeneration.current || !result.ok) return
    setItems(result.data.items)
    setSummary(result.data.summary)
  }

  return (
    <main className="catalog-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">SG</div>
        <div>
          <h1>Skillgate Catalog</h1>
          <p>One local inventory for skills, agents, rules, and context.</p>
        </div>
        <div className="topbar-actions">
          {grant?.grantId !== "home" ? <button className="secondary" onClick={() => void loadCatalog(false, "home")}>Home</button> : null}
          <button className="secondary" onClick={() => void loadCatalog(false, "picker")}>Choose root</button>
          <button disabled={loading} onClick={() => void loadCatalog(true)}>Rescan</button>
        </div>
      </header>

      <section className="summary-grid" aria-label="Catalog summary">
        <SummaryCard label="All" value={summary.total} />
        {kinds.map((kind) => <SummaryCard key={kind} label={kind} value={summary.byKind[kind]} />)}
      </section>

      <section className="catalog-card">
        <aside className="filters">
          <div className="root-label"><span>Root</span><strong>{grant?.displayName ?? "Not selected"}</strong></div>
          <FilterGroup label="Type" values={kinds} selected={selectedKinds} onToggle={(value) => toggle(value, selectedKinds, setSelectedKinds)} />
          <FilterGroup label="Platform" values={platforms} selected={selectedPlatforms} onToggle={(value) => toggle(value, selectedPlatforms, setSelectedPlatforms)} />
          <FilterGroup label="Scope" values={scopes} selected={selectedScopes} onToggle={(value) => toggle(value, selectedScopes, setSelectedScopes)} />
        </aside>

        <div className="results">
          <div className="search-row">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, description, or location…" aria-label="Search catalog" />
            <span>{visibleItems.length} results</span>
          </div>
          {loading && items.length === 0 ? <State title="Scanning local catalog…" detail="Skillgate is reading only the granted root." /> : null}
          {loading && items.length > 0 ? <div className="refresh-status" role="status"><strong>Refreshing catalog…</strong><span>Existing results remain available.</span></div> : null}
          {!loading && error ? <State title="Catalog unavailable" detail={error} tone="error" /> : null}
          {!loading && !error && visibleItems.length === 0 ? <State title="No matching items" detail="Choose another root or clear the filters." /> : null}
          {!error && visibleItems.length > 0 ? (
            <div className="item-list">
              {visibleItems.map((item) => <CatalogRow key={item.itemId} item={item} selected={selection?.location.relativePath === item.location.relativePath} onSelect={() => chooseSelection(toFileSelection(item))} />)}
            </div>
          ) : null}
        </div>
      </section>
      {files && grant ? (
        <section className="workspace-layout">
          <WorktreePanel grant={grant} files={files} onSelect={(entry) => {
            if (entry.kind === "directory") return
            const matching = items.find((item) => item.location.grantId === entry.location.grantId && item.location.relativePath === entry.location.relativePath)
            chooseSelection(matching ? toFileSelection(matching) : { name: entry.name, displayPath: entry.location.relativePath, location: entry.location })
          }} />
          <div className="detail-pane">
            {runtime && selectedItem?.kind === "agent" ? (
              <div className="agent-actions">
                <div><strong>{selectedItem.name}</strong><span>Launch in an interactive terminal</span></div>
                <button onClick={() => setLaunchAgent(selectedItem)}>Start agent</button>
              </div>
            ) : null}
            {selection ? <FileDetail selection={selection} files={files} onDirtyChange={setDirty} onMutation={refreshAfterMutation} /> : <State title="Select a file" detail="Choose a catalog or Worktree file to preview it." />}
          </div>
        </section>
      ) : null}
      {runtime ? <TerminalWorkspace controller={runtime.terminals} /> : null}
      {runtime && launchAgent ? (
        <AgentLaunchDialog
          open
          agent={toAgentSelection(launchAgent)}
          cwd={agentWorkingDirectory(launchAgent)}
          api={runtime.api}
          terminals={runtime.terminals}
          onCancel={() => setLaunchAgent(null)}
          onStarted={() => setLaunchAgent(null)}
        />
      ) : null}
    </main>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <div className="summary-card"><span>{label}</span><strong>{value}</strong></div>
}

function FilterGroup<T extends string>({ label, values, selected, onToggle }: { label: string; values: T[]; selected: T[]; onToggle: (value: T) => void }) {
  return (
    <fieldset><legend>{label}</legend>{values.map((value) => (
      <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} /><span>{value}</span></label>
    ))}</fieldset>
  )
}

function CatalogRow({ item, selected, onSelect }: { item: CatalogItem; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`catalog-row ${selected ? "selected" : ""}`} onClick={onSelect}>
      <span className={`kind kind-${item.kind}`}>{item.kind.slice(0, 1).toUpperCase()}</span>
      <div className="item-copy"><div><strong>{item.name}</strong><span>{item.platform} · {item.scope}</span></div><p>{item.description || "No description"}</p><code>{item.displayPath}</code></div>
      <span className="group-pill">{item.groupLabel}</span>
    </button>
  )
}

function toFileSelection(item: CatalogItem): FileSelection {
  return { name: item.name, displayPath: item.displayPath, location: item.location, description: item.description }
}

function toAgentSelection(item: CatalogItem): AgentCatalogSelection {
  return {
    itemId: item.itemId,
    canonicalItemId: item.canonicalItemId,
    name: item.name,
    slug: item.slug,
    platform: item.platform,
    location: item.location,
  }
}

function agentWorkingDirectory(item: CatalogItem) {
  const parts = item.location.relativePath.replaceAll("\\", "/").split("/").filter(Boolean)
  const configIndex = parts.findIndex((part) => [".agents", ".claude", ".codex", ".cursor"].includes(part))
  return {
    grantId: item.location.grantId,
    relativePath: configIndex < 0 ? "" : parts.slice(0, configIndex).join("/"),
  }
}

function State({ title, detail, tone }: { title: string; detail: string; tone?: "error" }) {
  return <div className={`state ${tone ?? ""}`}><strong>{title}</strong><p>{detail}</p></div>
}
