// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"
import { CatalogPage } from "./catalog-page"
import type { AppResult, CatalogItem, CatalogSnapshot, RootGrant } from "../lib/app-api"
import type { CatalogClient } from "../lib/catalog-client"

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
  }
}

function snapshot(grant: RootGrant, name: string): CatalogSnapshot {
  const entry = item(grant, name)
  return {
    grant, revision: name, groups: [{ groupId: "g", label: "Global", kind: "skill", platform: "codex", itemIds: [name] }],
    items: [entry], summary: { total: 1, byKind: { skill: 1, agent: 0, rule: 0, context: 0 }, byPlatform: { cursor: 0, claude: 0, codex: 1, shared: 0 }, byScope: { global: 1, project: 0 }, projectNames: [] }, skippedUnreadable: 0,
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
    } as CatalogClient
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
})
