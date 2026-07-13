// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AppResult, FileTreeEntry, PathRef, RootGrant } from "../lib/app-api"
import type { FilesClient } from "../lib/files-client"
import { WorktreePanel } from "./worktree-panel"

globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.replaceChildren()
  globalThis.localStorage?.clear()
})

function ok<T>(data: T): AppResult<T> {
  return { ok: true, data, meta: { requestId: "r", correlationId: "c", completedAt: "now" } }
}

function entry(name: string, kind: FileTreeEntry["kind"], relativePath = name): FileTreeEntry {
  return { entryId: relativePath, name, kind, location: { grantId: "root", relativePath }, size: kind === "file" ? 1 : null, modifiedAt: "now" }
}

function files(listDirectory: FilesClient["listDirectory"]): FilesClient {
  return {
    read: async () => ok(""), stat: async () => { throw new Error("unused") }, listDirectory,
    tree: async () => { throw new Error("unused") }, write: async () => { throw new Error("unused") },
    delete: async () => { throw new Error("unused") }, recover: async () => { throw new Error("unused") }, reveal: async () => ok({ value: null }),
  }
}

async function render(client: FilesClient, grant: RootGrant = { grantId: "root", displayName: "Root", persisted: false }) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => { root.render(<WorktreePanel grant={grant} files={client} onSelect={() => {}} />) })
  return { container, root }
}

describe("WorktreePanel", () => {
  it("loads folders lazily and preserves folder-first display", async () => {
    const list = vi.fn(async (directory: PathRef) => ok(directory.relativePath
      ? [entry("child.md", "file", "folder/child.md")]
      : [entry("z.md", "file"), entry("folder", "directory")]))
    const view = await render(files(list))
    expect(view.container.textContent?.indexOf("folder")).toBeLessThan(view.container.textContent?.indexOf("z.md") ?? 0)
    expect(view.container.textContent).not.toContain("child.md")
    const folder = [...view.container.querySelectorAll("button")].find((button) => button.textContent?.includes("folder"))
    await act(async () => { folder?.click(); await Promise.resolve() })
    expect(list).toHaveBeenCalledTimes(2)
    expect(view.container.textContent).toContain("child.md")
    await act(async () => view.root.unmount())
  })

  it("renders a stable empty state", async () => {
    const view = await render(files(async () => ok([])))
    expect(view.container.textContent).toContain("No files in this root")
    await act(async () => view.root.unmount())
  })

  it("renders typed listing failures without crashing the shell", async () => {
    const view = await render(files(async () => ({
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Directory access denied", category: "authorization", retryable: false },
      meta: { requestId: "r", correlationId: "c", completedAt: "now" },
    })))
    expect(view.container.textContent).toContain("Directory access denied")
    await act(async () => view.root.unmount())
  })

  it("does not let a stale root listing overwrite a newer grant", async () => {
    let resolveOld!: (value: AppResult<FileTreeEntry[]>) => void
    const oldListing = new Promise<AppResult<FileTreeEntry[]>>((resolve) => { resolveOld = resolve })
    const client = files(async (directory) => directory.grantId === "old" ? oldListing : ok([entry("new.md", "file")]))
    const oldGrant = { grantId: "old", displayName: "Old", persisted: false }
    const newGrant = { grantId: "new", displayName: "New", persisted: false }
    const view = await render(client, oldGrant)
    await act(async () => { view.root.render(<WorktreePanel grant={newGrant} files={client} onSelect={() => {}} />); await Promise.resolve() })
    await act(async () => { resolveOld(ok([entry("stale.md", "file")])); await Promise.resolve() })
    expect(view.container.textContent).toContain("new.md")
    expect(view.container.textContent).not.toContain("stale.md")
    await act(async () => view.root.unmount())
  })
})
