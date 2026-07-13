import { useEffect, useMemo, useRef, useState } from "react"
import type {
  CatalogItem,
  CatalogKind,
  CatalogPlatform,
  CatalogScope,
  CatalogSummary,
  RootGrant,
} from "../lib/app-api"
import type { CatalogClient } from "../lib/catalog-client"

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

export function CatalogPage({ api }: { api: CatalogClient }) {
  const [grant, setGrant] = useState<RootGrant | null>(null)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [summary, setSummary] = useState(emptySummary)
  const [query, setQuery] = useState("")
  const [selectedKinds, setSelectedKinds] = useState<CatalogKind[]>([])
  const [selectedPlatforms, setSelectedPlatforms] = useState<CatalogPlatform[]>([])
  const [selectedScopes, setSelectedScopes] = useState<CatalogScope[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestGeneration = useRef(0)

  async function loadCatalog(force = false, source?: "home" | "picker") {
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
    setGrant(nextGrant)
    const result = await api.scan(nextGrant.grantId, force)
    if (generation !== requestGeneration.current) return
    if (result.ok) {
      setItems(result.data.items)
      setSummary(result.data.summary)
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
          <button onClick={() => void loadCatalog(true)}>Rescan</button>
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
          {loading ? <State title="Scanning local catalog…" detail="Skillgate is reading only the granted root." /> : null}
          {!loading && error ? <State title="Catalog unavailable" detail={error} tone="error" /> : null}
          {!loading && !error && visibleItems.length === 0 ? <State title="No matching items" detail="Choose another root or clear the filters." /> : null}
          {!loading && !error ? (
            <div className="item-list">
              {visibleItems.map((item) => <CatalogRow key={item.itemId} item={item} />)}
            </div>
          ) : null}
        </div>
      </section>
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

function CatalogRow({ item }: { item: CatalogItem }) {
  return (
    <article className="catalog-row">
      <span className={`kind kind-${item.kind}`}>{item.kind.slice(0, 1).toUpperCase()}</span>
      <div className="item-copy"><div><strong>{item.name}</strong><span>{item.platform} · {item.scope}</span></div><p>{item.description || "No description"}</p><code>{item.displayPath}</code></div>
      <span className="group-pill">{item.groupLabel}</span>
    </article>
  )
}

function State({ title, detail, tone }: { title: string; detail: string; tone?: "error" }) {
  return <div className={`state ${tone ?? ""}`}><strong>{title}</strong><p>{detail}</p></div>
}
