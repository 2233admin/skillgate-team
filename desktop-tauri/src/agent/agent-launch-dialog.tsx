import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import {
  createRequestMeta,
  type AgentCatalogSelection,
  type AgentHarness,
  type AppAPI,
  type HarnessModel,
  type HarnessPolicy,
  type PathRef,
} from "../lib/app-api"
import type { TerminalController } from "../terminal/terminal-controller"

export interface AgentLaunchDialogProps {
  open: boolean
  agent: AgentCatalogSelection
  cwd: PathRef
  api: Pick<AppAPI, "agentLaunch">
  terminals: TerminalController
  onCancel: () => void
  onStarted?: (terminalId: string) => void
}

const HARNESS_LABELS: Record<AgentHarness, string> = {
  cursor: "Cursor",
  "claude-code": "Claude Code",
  codex: "Codex",
}

function nativeHarness(agent: AgentCatalogSelection): AgentHarness | null {
  if (agent.platform === "cursor") return "cursor"
  if (agent.platform === "claude") return "claude-code"
  if (agent.platform === "codex") return "codex"
  return null
}

export function AgentLaunchDialog({
  open,
  agent,
  cwd,
  api,
  terminals,
  onCancel,
  onStarted,
}: AgentLaunchDialogProps) {
  const [policies, setPolicies] = useState<HarnessPolicy[]>([])
  const [harness, setHarness] = useState<AgentHarness | null>(null)
  const [model, setModel] = useState<HarnessModel | null>(null)
  const [prompt, setPrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  useEffect(() => {
    if (!open) return
    const current = ++generation.current
    const initialHarness = nativeHarness(agent)
    setPolicies([])
    setHarness(initialHarness)
    setModel(null)
    setPrompt("")
    setError(null)
    setLoading(true)
    void api.agentLaunch
      .getHarnessPolicy({ agentItemId: agent.itemId }, createRequestMeta())
      .then((result) => {
        if (current !== generation.current) return
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        setPolicies(result.data)
        const selected = initialHarness ?? null
        if (selected) {
          const policy = result.data.find((entry) => entry.harness === selected)
          setModel(policy?.defaultModel ?? null)
        }
      })
      .finally(() => {
        if (current === generation.current) setLoading(false)
      })
    return () => { generation.current += 1 }
  }, [agent, api, open])

  const policy = useMemo(
    () => policies.find((entry) => entry.harness === harness) ?? null,
    [harness, policies],
  )

  function chooseHarness(next: AgentHarness) {
    setHarness(next)
    const nextPolicy = policies.find((entry) => entry.harness === next)
    setModel(nextPolicy?.defaultModel ?? null)
    setError(null)
  }

  async function start(event: FormEvent) {
    event.preventDefault()
    if (!harness || !model || !policy?.installed) return
    setStarting(true)
    setError(null)
    const prepared = await api.agentLaunch.prepare(
      {
        agent,
        harness,
        model,
        prompt: prompt.trim() || undefined,
        cwd,
      },
      createRequestMeta(),
    )
    if (!prepared.ok) {
      setError(prepared.error.message)
      setStarting(false)
      return
    }
    const terminal = await terminals.start(
      prepared.data.preparedLaunchId,
      `${agent.name} · ${HARNESS_LABELS[harness]}`,
    )
    setStarting(false)
    if (!terminal.ok) {
      setError(terminal.error.message)
      return
    }
    onStarted?.(terminal.data.terminalId)
  }

  if (!open) return null

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="agent-launch-title">
      <form onSubmit={start}>
        <h2 id="agent-launch-title">Start {agent.name}</h2>
        {loading && <p role="status">Loading harnesses…</p>}
        {agent.platform === "shared" && (
          <fieldset>
            <legend>Harness</legend>
            {policies.map((entry) => (
              <label key={entry.harness}>
                <input
                  type="radio"
                  name="harness"
                  value={entry.harness}
                  checked={harness === entry.harness}
                  disabled={!entry.installed}
                  onChange={() => chooseHarness(entry.harness)}
                />
                {HARNESS_LABELS[entry.harness]}
                {!entry.installed && " — not installed"}
              </label>
            ))}
          </fieldset>
        )}
        {harness && <p>Harness: {HARNESS_LABELS[harness]}</p>}
        {policy && (
          <label>
            Model
            <select
              value={model ?? ""}
              disabled={!policy.installed}
              onChange={(event) => setModel(event.target.value as HarnessModel)}
            >
              {policy.models.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </label>
        )}
        {policy && !policy.installed && (
          <p role="alert">{policy.missingCliGuidance ?? `${HARNESS_LABELS[policy.harness]} is not installed.`}</p>
        )}
        <label>
          Optional message
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={loading || starting || !policy?.installed || !model}>
          {starting ? "Starting…" : "Start agent"}
        </button>
      </form>
    </div>
  )
}

