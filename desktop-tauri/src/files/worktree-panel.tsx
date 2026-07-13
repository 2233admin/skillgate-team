import { useEffect, useRef, useState } from "react"
import type { FileTreeEntry, RootGrant } from "../lib/app-api"
import type { FilesClient } from "../lib/files-client"

const visibleKey = "skillgate:worktree-visible"
const widthKey = "skillgate:worktree-width"

export function WorktreePanel({
  grant,
  files,
  onSelect,
}: {
  grant: RootGrant
  files: FilesClient
  onSelect: (entry: FileTreeEntry) => void
}) {
  const [visible, setVisible] = useState(() => readBoolean(visibleKey, true))
  const [width, setWidth] = useState(() => readNumber(widthKey, 260, 180, 420))
  const [entries, setEntries] = useState<FileTreeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  useEffect(() => {
    const current = ++generation.current
    setLoading(true)
    setError(null)
    void files.listDirectory({ grantId: grant.grantId, relativePath: "" }).then((result) => {
      if (current !== generation.current) return
      if (result.ok) setEntries(sortEntries(result.data))
      else setError(result.error.message)
      setLoading(false)
    })
    return () => { generation.current += 1 }
  }, [files, grant.grantId])

  function toggleVisible() {
    setVisible((current) => {
      persist(visibleKey, String(!current))
      return !current
    })
  }

  function resize(next: number) {
    const bounded = Math.min(420, Math.max(180, next))
    setWidth(bounded)
    persist(widthKey, String(bounded))
  }

  return (
    <aside className={`worktree-panel ${visible ? "" : "collapsed"}`} style={{ width: visible ? width : 46 }} aria-label="Worktree">
      <header className="worktree-header">
        {visible ? <strong>Worktree</strong> : null}
        <button className="icon-button" onClick={toggleVisible} aria-label={visible ? "Hide worktree" : "Show worktree"}>{visible ? "‹" : "›"}</button>
      </header>
      {visible ? (
        <>
          <div className="worktree-root" title={grant.displayName}>{grant.displayName}</div>
          <input className="worktree-width" type="range" min="180" max="420" value={width} onChange={(event) => resize(Number(event.target.value))} aria-label="Worktree width" />
          <div className="worktree-tree">
            {loading ? <div className="tree-state">Loading worktree…</div> : null}
            {!loading && error ? <div className="tree-state error" role="alert">{error}</div> : null}
            {!loading && !error && entries.length === 0 ? <div className="tree-state">No files in this root</div> : null}
            {!loading && !error ? entries.map((entry) => <WorktreeNode key={entry.entryId} entry={entry} files={files} onSelect={onSelect} level={0} />) : null}
          </div>
        </>
      ) : null}
    </aside>
  )
}

function WorktreeNode({
  entry,
  files,
  onSelect,
  level,
}: {
  entry: FileTreeEntry
  files: FilesClient
  onSelect: (entry: FileTreeEntry) => void
  level: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileTreeEntry[] | null>(entry.children ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  async function toggle() {
    if (entry.kind !== "directory") {
      onSelect(entry)
      return
    }
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (children) return
    const current = ++generation.current
    setLoading(true)
    setError(null)
    const result = await files.listDirectory(entry.location)
    if (current !== generation.current) return
    if (result.ok) setChildren(sortEntries(result.data))
    else setError(result.error.message)
    setLoading(false)
  }

  useEffect(() => () => { generation.current += 1 }, [])

  return (
    <div className="worktree-node">
      <button className="tree-row" style={{ paddingLeft: 8 + level * 14 }} onClick={() => void toggle()}>
        <span aria-hidden="true">{entry.kind === "directory" ? (expanded ? "▾" : "▸") : "·"}</span>
        <span>{entry.name}</span>
      </button>
      {expanded ? (
        <div>
          {loading ? <div className="tree-inline-state" style={{ paddingLeft: 24 + level * 14 }}>Loading…</div> : null}
          {error ? <div className="tree-inline-state error" style={{ paddingLeft: 24 + level * 14 }}>{error}</div> : null}
          {!loading && !error && children?.length === 0 ? <div className="tree-inline-state" style={{ paddingLeft: 24 + level * 14 }}>Empty folder</div> : null}
          {children?.map((child) => <WorktreeNode key={child.entryId} entry={child} files={files} onSelect={onSelect} level={level + 1} />)}
        </div>
      ) : null}
    </div>
  )
}

function sortEntries(entries: FileTreeEntry[]) {
  return [...entries].sort((left, right) => {
    const rank = (entry: FileTreeEntry) => entry.kind === "directory" ? 0 : 1
    return rank(left) - rank(right) || left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  })
}

function persist(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private contexts may disable storage */ }
}

function readBoolean(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === "true"
  } catch { return fallback }
}

function readNumber(key: string, fallback: number, min: number, max: number) {
  try {
    const value = Number(localStorage.getItem(key))
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback
  } catch { return fallback }
}
