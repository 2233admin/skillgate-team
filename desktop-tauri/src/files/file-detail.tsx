import { useEffect, useRef, useState } from "react"
import type { FileStat, PathRef } from "../lib/app-api"
import type { FilesClient } from "../lib/files-client"

export interface FileSelection {
  name: string
  displayPath: string
  location: PathRef
  description?: string
}

export function FileDetail({
  selection,
  files,
  onDirtyChange,
  onMutation,
}: {
  selection: FileSelection
  files: FilesClient
  onDirtyChange?: (dirty: boolean) => void
  onMutation?: () => void | Promise<void>
}) {
  const [content, setContent] = useState("")
  const [draft, setDraft] = useState("")
  const [stats, setStats] = useState<FileStat | null>(null)
  const [mode, setMode] = useState<"rendered" | "raw">("rendered")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null)
  const generation = useRef(0)
  const dirty = draft !== content

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  async function load() {
    const current = ++generation.current
    setLoading(true)
    setError(null)
    const [readResult, statResult] = await Promise.all([
      files.read(selection.location),
      files.stat(selection.location),
    ])
    if (current !== generation.current) return
    if (!readResult.ok) {
      setError(readResult.error.message)
    } else if (!statResult.ok) {
      setError(statResult.error.message)
    } else {
      setContent(readResult.data)
      setDraft(readResult.data)
      setStats(statResult.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    setContent("")
    setDraft("")
    setStats(null)
    setRecoveryToken(null)
    setConfirmDelete(false)
    void load()
    return () => { generation.current += 1 }
  }, [selection.location.grantId, selection.location.relativePath, files])

  async function reload() {
    if (dirty && !window.confirm("Discard unsaved changes and reload this file?")) return
    await load()
  }

  async function save() {
    if (!dirty || !stats) return
    setSaving(true)
    setError(null)
    const result = await files.write(selection.location, draft, stats.revision)
    if (result.ok) {
      setContent(draft)
      setStats({ ...stats, revision: result.data.revision, size: new TextEncoder().encode(draft).length })
      await onMutation?.()
    } else {
      setError(result.error.message)
    }
    setSaving(false)
  }

  async function remove() {
    setError(null)
    const result = await files.delete(selection.location, stats?.revision)
    if (result.ok) {
      setRecoveryToken(result.data.recoveryToken)
      setConfirmDelete(false)
      await onMutation?.()
    } else {
      setError(result.error.message)
    }
  }

  async function recover() {
    if (!recoveryToken) return
    setError(null)
    const result = await files.recover(recoveryToken)
    if (result.ok) {
      setRecoveryToken(null)
      await load()
      await onMutation?.()
    } else {
      setError(result.error.message)
    }
  }

  return (
    <section className="file-detail" aria-label="File detail">
      <header className="detail-header">
        <div>
          <h2>{selection.name}</h2>
          <code>{selection.displayPath}</code>
        </div>
        <div className="detail-actions">
          <button className="secondary" onClick={() => setMode("rendered")} aria-pressed={mode === "rendered"}>Rendered</button>
          <button className="secondary" onClick={() => setMode("raw")} aria-pressed={mode === "raw"}>Raw</button>
          <button className="secondary" onClick={() => void reload()}>Reload</button>
          {dirty ? <button className="secondary" onClick={() => setDraft(content)}>Discard</button> : null}
          <button onClick={() => void save()} disabled={!dirty || saving}>{saving ? "Saving…" : "Save"}</button>
          <button className="danger" onClick={() => setConfirmDelete(true)}>Delete</button>
        </div>
      </header>

      {selection.description ? <p className="detail-description">{selection.description}</p> : null}
      {stats ? <div className="file-meta"><span>{stats.size} bytes</span><span>Modified {stats.modifiedAt}</span><span>{stats.createdAt ? `Created ${stats.createdAt}` : "Created time unavailable"}</span></div> : null}
      {dirty ? <div className="dirty-indicator">Unsaved changes</div> : null}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {recoveryToken ? <div className="recovery-banner">File moved to quarantine. <button onClick={() => void recover()}>Undo</button></div> : null}
      {loading ? <div className="detail-state">Loading preview…</div> : mode === "raw" ? (
        <textarea className="raw-editor" aria-label="Raw file content" value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} />
      ) : (
        <PlainMarkdown content={draft} />
      )}

      {confirmDelete ? (
        <div className="modal-backdrop" role="presentation">
          <div className="delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <h3 id="delete-title">Move file to quarantine?</h3>
            <p>Confirm the exact granted path:</p>
            <code>{selection.location.grantId}:{selection.location.relativePath}</code>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="danger" onClick={() => void remove()}>Confirm delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function PlainMarkdown({ content }: { content: string }) {
  const lines = content.split(/\r?\n/)
  return (
    <div className="safe-preview" aria-label="Rendered preview">
      <div className="links-disabled">Links are disabled until the scoped host opener is available.</div>
      {lines.map((line, index) => {
        if (line.startsWith("### ")) return <h4 key={index}>{line.slice(4)}</h4>
        if (line.startsWith("## ")) return <h3 key={index}>{line.slice(3)}</h3>
        if (line.startsWith("# ")) return <h2 key={index}>{line.slice(2)}</h2>
        if (/^[-*] /.test(line)) return <div className="preview-list-item" key={index}>• {line.slice(2)}</div>
        if (line.startsWith("> ")) return <blockquote key={index}>{line.slice(2)}</blockquote>
        if (!line.trim()) return <br key={index} />
        return <p key={index}>{line}</p>
      })}
    </div>
  )
}
