// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  AgentCatalogSelection,
  AppAPI,
  AppResult,
  HarnessPolicy,
} from "../lib/app-api"
import type { TerminalController } from "../terminal/terminal-controller"
import { AgentLaunchDialog } from "./agent-launch-dialog"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const containers: HTMLDivElement[] = []

afterEach(() => {
  for (const container of containers.splice(0)) container.remove()
})

function ok<T>(data: T): AppResult<T> {
  return { ok: true, data, meta: { requestId: "r", correlationId: "c", completedAt: "now" } }
}

const policies: HarnessPolicy[] = [
  { harness: "cursor", installed: true, models: ["auto", "composer-2.5"], defaultModel: "auto" },
  { harness: "claude-code", installed: false, models: ["opus-4.8"], defaultModel: "opus-4.8", missingCliGuidance: "Install Claude" },
  { harness: "codex", installed: true, models: ["o3", "gpt-5-codex", "codex-mini"], defaultModel: "o3" },
]

const sharedAgent: AgentCatalogSelection = {
  itemId: "agent-1",
  canonicalItemId: "agent-1",
  name: "Reviewer",
  slug: "reviewer",
  platform: "shared",
  location: { grantId: "home", relativePath: ".agents/agents/reviewer.md" },
}

describe("AgentLaunchDialog", () => {
  it("requires a shared harness, uses its exact model policy, and trims the prompt", async () => {
    const prepare = vi.fn(async () => ok({
      preparedLaunchId: "prepared-1",
      agent: sharedAgent,
      harness: "codex" as const,
      model: "o3" as const,
      normalizedPrompt: "review this",
      cwd: { grantId: "home", relativePath: "project" },
      executableIdentity: "codex",
      argv: ["--model", "o3", "review this"],
      expiresAt: "later",
    }))
    const start = vi.fn(async () => ok({ terminalId: "pty-1", pid: 42, startedAt: "now" }))
    const cancel = vi.fn()
    const api = {
      agentLaunch: {
        getHarnessPolicy: vi.fn(async () => ok(policies)),
        prepare,
      },
    } as Pick<AppAPI, "agentLaunch">
    const terminals = { start } as unknown as TerminalController
    const container = document.createElement("div")
    containers.push(container)
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <AgentLaunchDialog
          open
          agent={sharedAgent}
          cwd={{ grantId: "home", relativePath: "project" }}
          api={api}
          terminals={terminals}
          onCancel={cancel}
        />,
      )
      await Promise.resolve()
    })
    expect(container.textContent).toContain("Claude Code — not installed")
    const codex = container.querySelector<HTMLInputElement>('input[value="codex"]')
    await act(async () => codex?.click())
    const select = container.querySelector("select")
    expect(select?.value).toBe("o3")
    expect([...select!.options].map((option) => option.value)).toEqual(["o3", "gpt-5-codex", "codex-mini"])
    const prompt = container.querySelector("textarea")!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      setter?.call(prompt, "  review this  ")
      prompt.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({ harness: "codex", model: "o3", prompt: "review this" }),
      expect.any(Object),
    )
    expect(start).toHaveBeenCalledWith("prepared-1", "Reviewer · Codex")
    expect(cancel).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })

  it("cancel performs no launch operation", async () => {
    const prepare = vi.fn()
    const cancel = vi.fn()
    const api = {
      agentLaunch: {
        getHarnessPolicy: vi.fn(async () => ok(policies)),
        prepare,
      },
    } as Pick<AppAPI, "agentLaunch">
    const container = document.createElement("div")
    containers.push(container)
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <AgentLaunchDialog
          open
          agent={sharedAgent}
          cwd={{ grantId: "home", relativePath: "project" }}
          api={api}
          terminals={{} as TerminalController}
          onCancel={cancel}
        />,
      )
      await Promise.resolve()
    })
    const button = [...container.querySelectorAll("button")].find((entry) => entry.textContent === "Cancel")
    await act(async () => button?.click())
    expect(cancel).toHaveBeenCalledOnce()
    expect(prepare).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })
})
