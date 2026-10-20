import { useEffect, useMemo, useRef, useState } from "react"
import type {
  AgentCatalogSelection,
  AppAPI,
  CatalogInstallationLevel,
  CatalogItem,
  CatalogKind,
  CatalogPlatform,
  CatalogRiskLevel,
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
import {
  catalogItemSupportsPlatform,
  catalogSkillFacts,
  catalogSkillSearchText,
  installationLabel,
  platformLabel,
  riskLabel,
} from "./catalog-skill-facts"

const kinds: CatalogKind[] = ["skill", "agent", "rule", "context"]
const platforms: CatalogPlatform[] = ["shared", "codex", "claude", "cursor"]
const installationLevels: CatalogInstallationLevel[] = ["global", "project", "plugin", "external"]
const riskLevels: CatalogRiskLevel[] = ["low", "medium", "high"]

const emptySummary: CatalogSummary = {
  total: 0,
  byKind: { skill: 0, agent: 0, rule: 0, context: 0 },
  byPlatform: { shared: 0, codex: 0, claude: 0, cursor: 0 },
  byScope: { global: 0, project: 0 },
  byInstallationLevel: { global: 0, project: 0, plugin: 0, external: 0 },
  byRiskLevel: { low: 0, medium: 0, high: 0 },
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
  const [selectedInstallationLevels, setSelectedInstallationLevels] = useState<CatalogInstallationLevel[]>([])
  const [selectedRiskLevels, setSelectedRiskLevels] = useState<CatalogRiskLevel[]>([])
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

  const skillInventory = useMemo(() => ({
    claude: items.filter((item) => item.kind === "skill" && catalogItemSupportsPlatform(item, "claude")).length,
    codex: items.filter((item) => item.kind === "skill" && catalogItemSupportsPlatform(item, "codex")).length,
    review: summary.byRiskLevel.medium + summary.byRiskLevel.high,
  }), [items, summary])

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return items.filter((item) => {
      if (selectedKinds.length && !selectedKinds.includes(item.kind)) return false
      if (selectedPlatforms.length && !selectedPlatforms.some((platform) => catalogItemSupportsPlatform(item, platform))) return false
      if (selectedInstallationLevels.length && (!item.skillMeta || !selectedInstallationLevels.includes(item.skillMeta.installationLevel))) return false
      if (selectedRiskLevels.length && (!item.skillMeta || !selectedRiskLevels.includes(item.skillMeta.riskLevel))) return false
      return !needle || `${item.name} ${item.description} ${item.displayPath} ${catalogSkillSearchText(item)}`.toLocaleLowerCase().includes(needle)
    })
  }, [items, query, selectedKinds, selectedPlatforms, selectedInstallationLevels, selectedRiskLevels])
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
          <h1>Skillgate Local Skills</h1>
          <p>Inventory, search, classify, and health-check Claude Code and Codex skills on this machine.</p>
        </div>
        <div className="topbar-actions">
          {grant?.grantId !== "home" ? <button className="secondary" onClick={() => void loadCatalog(false, "home")}>Home</button> : null}
          <button className="secondary" onClick={() => void loadCatalog(false, "picker")}>Choose root</button>
          <button disabled={loading} onClick={() => void loadCatalog(true)}>Rescan</button>
        </div>
      </header>

      <section className="summary-stack" aria-label="Catalog and local skill summary">
        <div className="summary-grid summary-grid-catalog" aria-label="Catalog overview">
          <SummaryCard label="All" value={summary.total} />
          <SummaryCard label="Agents" value={summary.byKind.agent} />
          <SummaryCard label="Rules" value={summary.byKind.rule} />
          <SummaryCard label="Context" value={summary.byKind.context} />
        </div>
        <div className="summary-grid summary-grid-skills" aria-label="Local skill overview">
          <SummaryCard label="Local skills" value={summary.byKind.skill} />
          <SummaryCard label="Claude Code" value={skillInventory.claude} />
          <SummaryCard label="Codex" value={skillInventory.codex} />
          <SummaryCard label="Plugins" value={summary.byInstallationLevel.plugin} />
          <SummaryCard label="Needs review" value={skillInventory.review} tone={skillInventory.review ? "review" : undefined} />
        </div>
      </section>

      <section className="catalog-card">
        <aside className="filters">
          <div className="root-label"><span>Root</span><strong>{grant?.displayName ?? "Not selected"}</strong></div>
          <FilterGroup label="Type" values={kinds} selected={selectedKinds} onToggle={(value) => toggle(value, selectedKinds, setSelectedKinds)} />
          <FilterGroup label="Adapter" values={platforms} selected={selectedPlatforms} labelFor={platformLabel} onToggle={(value) => toggle(value, selectedPlatforms, setSelectedPlatforms)} />
          <FilterGroup label="Installation" values={installationLevels} selected={selectedInstallationLevels} labelFor={installationLabel} onToggle={(value) => toggle(value, selectedInstallationLevels, setSelectedInstallationLevels)} />
          <FilterGroup label="Health" values={riskLevels} selected={selectedRiskLevels} labelFor={riskLabel} onToggle={(value) => toggle(value, selectedRiskLevels, setSelectedRiskLevels)} />
        </aside>

        <div className="results">
          <div className="inventory-note">
            <strong>AI coding Skills, not SQL.</strong>
            <span>Usage is not inferred. Health checks inspect SKILL.md for selected static signals only; no result is a safety guarantee.</span>
          </div>
          <div className="search-row">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skill, adapter, source, risk, or location…" aria-label="Search local skills and assets" />
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
            {selection ? <FileDetail key={`${selection.location.grantId}::${selection.location.relativePath}`} selection={selection} files={files} onDirtyChange={setDirty} onMutation={refreshAfterMutation} /> : <State title="Select a file" detail="Choose a catalog or Worktree file to preview it." />}
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

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: "review" }) {
  return <div className={`summary-card ${tone ?? ""}`}><span>{label}</span><strong>{value}</strong></div>
}

function FilterGroup<T extends string>({ label, values, selected, onToggle, labelFor = (value) => value }: { label: string; values: T[]; selected: T[]; onToggle: (value: T) => void; labelFor?: (value: T) => string }) {
  return (
    <fieldset><legend>{label}</legend>{values.map((value) => (
      <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} /><span>{labelFor(value)}</span></label>
    ))}</fieldset>
  )
}

function CatalogRow({ item, selected, onSelect }: { item: CatalogItem; selected: boolean; onSelect: () => void }) {
  const facts = catalogSkillFacts(item)
  return (
    <button className={`catalog-row ${selected ? "selected" : ""}`} onClick={onSelect}>
      <span className={`kind kind-${item.kind}`}>{item.kind.slice(0, 1).toUpperCase()}</span>
      <div className="item-copy">
        <div className="item-heading"><strong>{item.name}</strong><span>{facts ? facts.adapters : `${platformLabel(item.platform)} · ${item.scope}`}</span></div>
        <p>{item.description || "No description"}</p>
        {facts ? (
          <div className="item-facts" aria-label="Skill inventory facts">
            <span>{facts.installation}</span><span>{facts.source}</span><span>{facts.usage}</span><span>{facts.locations}</span>
          </div>
        ) : null}
        <code>{item.displayPath}</code>
      </div>
      {item.skillMeta && facts
        ? <span className={`risk-pill risk-${item.skillMeta.riskLevel}`} title={facts.riskDetail}>{facts.risk}</span>
        : <span className="group-pill">{item.groupLabel}</span>}
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
