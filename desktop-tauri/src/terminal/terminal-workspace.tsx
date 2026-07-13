import { FormEvent, useEffect, useState, useSyncExternalStore } from "react"
import type { TerminalController } from "./terminal-controller"

export interface TerminalWorkspaceProps {
  controller: TerminalController
}

export function TerminalWorkspace({ controller }: TerminalWorkspaceProps) {
  const tabs = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeId || !tabs.some((tab) => tab.terminalId === activeId)) {
      setActiveId(tabs.at(-1)?.terminalId ?? null)
    }
  }, [activeId, tabs])

  const active = tabs.find((tab) => tab.terminalId === activeId) ?? null

  async function send(event: FormEvent) {
    event.preventDefault()
    if (!active || !input || active.status !== "running") return
    // A terminal Enter key is carriage return on both Unix PTYs and ConPTY.
    const result = await controller.write(active.terminalId, `${input}\r`)
    if (result.ok) {
      setInput("")
      setError(null)
    } else {
      setError(result.error.message)
    }
  }

  async function close() {
    if (!active) return
    if (active.status === "running") {
      const result = await controller.close(active.terminalId)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
    } else {
      controller.remove(active.terminalId)
    }
  }

  if (tabs.length === 0) {
    return <section aria-label="Agent terminals"><p>No agent terminals.</p></section>
  }

  return (
    <section aria-label="Agent terminals">
      <div role="tablist" aria-label="Terminal sessions">
        {tabs.map((tab) => (
          <button
            key={tab.terminalId}
            role="tab"
            aria-selected={tab.terminalId === activeId}
            onClick={() => setActiveId(tab.terminalId)}
          >
            {tab.title}{tab.status === "running" ? "" : ` (${tab.status})`}
          </button>
        ))}
      </div>
      {active && (
        <div role="tabpanel">
          <pre aria-label={`${active.title} output`}>{active.output}</pre>
          <form onSubmit={send}>
            <label>
              Terminal input
              <input
                value={input}
                disabled={active.status !== "running"}
                onChange={(event) => setInput(event.target.value)}
              />
            </label>
            <button type="submit" disabled={!input || active.status !== "running"}>Send</button>
            <button type="button" onClick={close}>
              {active.status === "running" ? "Close" : "Remove tab"}
            </button>
          </form>
          {active.status === "exited" && (
            <p role="status">Exited with code {active.exitCode ?? "unknown"}{active.signal ? ` (${active.signal})` : ""}</p>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </section>
  )
}
