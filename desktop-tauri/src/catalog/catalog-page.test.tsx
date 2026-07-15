// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CatalogPage } from "./catalog-page"
import type { AppResult, CatalogItem, CatalogSnapshot, RootGrant } from "../lib/app-api"
import type { CatalogClient } from "../lib/catalog-client"
import type { FilesClient } from "../lib/files-client"

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

function item(grant: RootGrant, name: string): CatalogItem {
  return {
    itemId: name, canonicalItemId: name, kind: "skill", platform: "codex", scope: "global",
    projectName: null, groupId: "g", groupLabel: "Global", name, slug: name.toLowerCase(),
    description: `${name} description`, location: { grantId: grant.grantId, relativePath: `.codex/skills/${name}/SKILL.md` },
    displayPath: `.codex/skills/${name}/SKILL.md`, aliases: [], createdAt: null, modifiedAt: "now",
    skillMeta: {
      compatibleWith: ["codex"], installationLevel: "global", sourceKind: "local", sourceLabel: "Local filesystem",
      usageStatus: "untracked", usageCount: null, lastUsedAt: null, installationCount: 1, riskLevel: "low", riskSignals: [],
    },
  }
}

function snapshot(grant: RootGrant, name: string): CatalogSnapshot {
  const entry = item(grant, name)
  return {
    grant, revision: name, groups: [{ groupId: "g", label: "Global", kind: "skill", platform: "codex", itemIds: [name] }],
    items: [entry], summary: {
      total: 1, byKind: { skill: 1, agent: 0, rule: 0, context: 0 }, byPlatform: { cursor: 0, claude: 0, codex: 1, shared: 0 },
      byScope: { global: 1, project: 0 }, byInstallationLevel: { global: 1, project: 0, plugin: 0, external: 0 },
      byRiskLevel: { low: 1, medium: 0, high: 0 }, projectNames: [],
    }, skippedUnreadable: 0,
  }
}

describe("CatalogPage request ordering", () => {
  it("does not let a stale home scan overwrite a newer picked root", async () => {
    const home = { grantId: "home", displayName: "Home", persisted: true }
    const picked = { grantId: "picker-1", displayName: "Project", persisted: false }
    let resolveHome!: (value: AppResult<CatalogSnapshot>) => void
    const homeScan = new Promise<AppResult<CatalogSnapshot>>((resolve) => { resolveHome = resolve })
    const client = {
      selectRoot: async (source = "home") => ok(source === "picker" ? picked : home),
      scan: async (grantId: string) => grantId === "home" ? homeScan : ok(snapshot(picked, "Picked")),
    } as unknown as CatalogClient
    const container = document.createElement("div")
    containers.push(container)
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => { root.render(<CatalogPage api={client} />) })
    const choose = [...container.querySelectorAll("button")].find((button) => button.textContent === "Choose root")
    await act(async () => { choose?.dispatchEvent(new MouseEvent("click", { bubbles: true })); await Promise.resolve() })
    await act(async () => { resolveHome(ok(snapshot(home, "Stale"))); await Promise.resolve() })

    expect(container.textContent).toContain("Project")
    expect(container.textContent).toContain("Picked")
    expect(container.textContent).not.toContain("Stale")
    await act(async () => root.unmount())
  })

  it("keeps the selected row when dirty-discard confirmation is cancelled", async () => {
    const grant = { grantId: "home", displayName: "Home", persisted: true }
    const first = item(grant, "First")
    const second = item(grant, "Second")
    const catalog = {
      selectRoot: async () => ok(grant),
      scan: async () => ok({
        ...snapshot(grant, "First"),
        items: [first, second],
        groups: [{ groupId: "g", label: "Global", kind: "skill", platform: "codex", itemIds: ["First", "Second"] }],
        summary: { ...snapshot(grant, "First").summary, total: 2, byKind: { skill: 2, agent: 0, rule: 0, context: 0 } },
      }),
    } as unknown as CatalogClient
    const files = {
      read: async (location) => ok(`# ${location.relativePath}`),
      stat: async (location) => ok({ location, kind: "file", size: 1, createdAt: null, modifiedAt: "now", revision: "rev" }),
      listDirectory: async () => ok([]),
      write: async () => { throw new Error("unused") }, delete: async () => { throw new Error("unused") }, recover: async () => { throw new Error("unused") },
      tree: async () => { throw new Error("unused") }, reveal: async () => ok({ value: null }),
    } as FilesClient
    const container = document.createElement("div")
    containers.push(container)
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => { root.render(<CatalogPage api={catalog} files={files} />); await Promise.resolve() })
    const raw = [...container.querySelectorAll("button")].find((button) => button.textContent === "Raw")
    await act(async () => raw?.click())
    const editor = container.querySelector("textarea")!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(editor, "dirty")
      editor.dispatchEvent(new Event("input", { bubbles: true }))
    })
    vi.spyOn(window, "confirm").mockReturnValue(false)
    const secondRow = [...container.querySelectorAll(".catalog-row")].find((row) => row.textContent?.includes("Second")) as HTMLButtonElement
    await act(async () => secondRow.click())
    expect(container.querySelector(".file-detail h2")?.textContent).toBe("First")
    await act(async () => root.unmount())
  })
})

describe("CatalogPage local skill inventory", () => {
  it("shows adapter, installation, provenance, usage, and risk facts", async () => {
    const grant = { grantId: "home", displayName: "Home", persisted: true }
    const plugin = item(grant, "Deploy")
    plugin.skillMeta = {
      compatibleWith: ["claude", "codex"], installationLevel: "plugin", sourceKind: "plugin", sourceLabel: "openai-bundled",
      usageStatus: "untracked", usageCount: null, lastUsedAt: null, installationCount: 2,
      riskLevel: "high", riskSignals: ["remoteExecution"],
    }
    const data = snapshot(grant, "Deploy")
    data.items = [plugin]
    data.summary.byInstallationLevel = { global: 0, project: 0, plugin: 1, external: 0 }
    data.summary.byRiskLevel = { low: 0, medium: 0, high: 1 }
    const catalog = {
      selectRoot: async () => ok(grant),
      scan: async () => ok(data),
    } as unknown as CatalogClient
    const container = document.createElement("div")
    containers.push(container)
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => { root.render(<CatalogPage api={catalog} />); await Promise.resolve() })

    expect(container.textContent).toContain("Skillgate Local Skills")
    expect(container.textContent).toContain("Claude Code + Codex")
    expect(container.textContent).toContain("Plugin · openai-bundled")
    expect(container.textContent).toContain("Usage not tracked")
    expect(container.textContent).toContain("High-severity signals")
    expect(container.querySelector(".risk-high")?.getAttribute("title")).toContain("SKILL.md static signals: Remote execution")
    await act(async () => root.unmount())
  })

  it("shows both catalog-wide and local-skill summaries", async () => {
    const grant = { grantId: "home", displayName: "Home", persisted: true }
    const data = snapshot(grant, "Deploy")
    data.summary = {
      ...data.summary,
      total: 7,
      byKind: { skill: 4, agent: 1, rule: 1, context: 1 },
      byInstallationLevel: { global: 3, project: 0, plugin: 1, external: 0 },
      byRiskLevel: { low: 3, medium: 1, high: 0 },
    }
    const catalog = {
      selectRoot: async () => ok(grant),
      scan: async () => ok(data),
    } as unknown as CatalogClient
    const container = document.createElement("div")
    containers.push(container)
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => { root.render(<CatalogPage api={catalog} />); await Promise.resolve() })
    const cards = Object.fromEntries([...container.querySelectorAll(".summary-card")].map((card) => [
      card.querySelector("span")?.textContent,
      card.querySelector("strong")?.textContent,
    ]))

    expect(cards).toMatchObject({
      All: "7", Agents: "1", Rules: "1", Context: "1", "Local skills": "4",
      "Claude Code": "0", Codex: "1", Plugins: "1", "Needs review": "1",
    })
    await act(async () => root.unmount())
  })

  it("keeps Shared items visible when metadata lists Claude and Codex compatibility", async () => {
    const grant = { grantId: "home", displayName: "Home", persisted: true }
    const shared = item(grant, "Shared skill")
    shared.platform = "shared"
    shared.skillMeta = { ...shared.skillMeta!, compatibleWith: ["claude", "codex"] }
    const codex = item(grant, "Codex only")
    const data = snapshot(grant, "Shared skill")
    data.items = [shared, codex]
    data.summary = {
      ...data.summary,
      total: 2,
      byKind: { skill: 2, agent: 0, rule: 0, context: 0 },
      byPlatform: { cursor: 0, claude: 0, codex: 1, shared: 1 },
      byInstallationLevel: { global: 2, project: 0, plugin: 0, external: 0 },
      byRiskLevel: { low: 2, medium: 0, high: 0 },
    }
    const catalog = {
      selectRoot: async () => ok(grant),
      scan: async () => ok(data),
    } as unknown as CatalogClient
    const container = document.createElement("div")
    containers.push(container)
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => { root.render(<CatalogPage api={catalog} />); await Promise.resolve() })
    const adapterFilters = [...container.querySelectorAll("fieldset")].find((group) => group.querySelector("legend")?.textContent === "Adapter")!
    const sharedFilter = [...adapterFilters.querySelectorAll("label")].find((label) => label.textContent === "Shared")?.querySelector("input") as HTMLInputElement
    await act(async () => { sharedFilter.click() })

    expect(container.textContent).toContain("Shared skill")
    expect(container.textContent).not.toContain("Codex only")
    await act(async () => root.unmount())
  })
})
