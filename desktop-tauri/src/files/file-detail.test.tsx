// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AppResult, FileStat, PathRef } from "../lib/app-api"
import type { FilesClient } from "../lib/files-client"
import { FileDetail, type FileSelection } from "./file-detail"

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ container: HTMLDivElement; root: Root }> = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const entry of mounted.splice(0)) {
    await act(async () => entry.root.unmount())
    entry.container.remove()
  }
})

function ok<T>(data: T): AppResult<T> {
  return { ok: true, data, meta: { requestId: "r", correlationId: "c", completedAt: "now" } }
}

function selection(relativePath: string): FileSelection {
  return { name: relativePath, displayPath: relativePath, location: { grantId: "root", relativePath } }
}

function stat(location: PathRef, revision: string): FileStat {
  return { location, kind: "file", size: 4, createdAt: null, modifiedAt: "now", revision }
}

function client(overrides: Partial<FilesClient> = {}): FilesClient {
  return {
    read: async (location) => ok(`# ${location.relativePath}`),
    stat: async (location) => ok(stat(location, `rev-${location.relativePath}`)),
    listDirectory: async () => ok([]),
    tree: async () => { throw new Error("unused") },
    write: async (_location, _content, expectedRevision) => ok({ revision: `${expectedRevision}-next`, receipt: { committed: true, idempotencyKey: "write", replayed: false } }),
    delete: async () => ok({ recoveryToken: "recover-1", receipt: { committed: true, idempotencyKey: "delete", replayed: false } }),
    recover: async () => ok({ location: { grantId: "root", relativePath: "a.md" }, receipt: { committed: true, idempotencyKey: "recover", replayed: false } }),
    reveal: async () => ok({ value: null }),
    ...overrides,
  }
}

function mount(element: React.ReactNode) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  mounted.push({ container, root })
  return { container, root, render: async (next: React.ReactNode) => act(async () => root.render(next)) }
}

function button(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === label)
}

function editTextarea(editor: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
  setter?.call(editor, value)
  editor.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("FileDetail", () => {
  it("ignores a stale preview after selection changes", async () => {
    let resolveFirst!: (value: AppResult<string>) => void
    const first = new Promise<AppResult<string>>((resolve) => { resolveFirst = resolve })
    const files = client({ read: async (location) => location.relativePath === "a.md" ? first : ok("# B wins") })
    const view = mount(null)
    await view.render(<FileDetail selection={selection("a.md")} files={files} />)
    await view.render(<FileDetail selection={selection("b.md")} files={files} />)
    await act(async () => { resolveFirst(ok("# stale A")); await Promise.resolve() })
    expect(view.container.textContent).toContain("B wins")
    expect(view.container.textContent).not.toContain("stale A")
  })

  it("keeps dirty text when reload is cancelled and saves with the loaded revision", async () => {
    const write = vi.fn(async (_location: PathRef, _content: string, expectedRevision?: string) => ok({ revision: "rev-next", receipt: { committed: true, idempotencyKey: "write", replayed: false } }))
    const files = client({ write })
    const view = mount(null)
    await view.render(<FileDetail selection={selection("a.md")} files={files} />)
    await act(async () => { button(view.container, "Raw")?.click() })
    const editor = view.container.querySelector("textarea")!
    await act(async () => {
      editTextarea(editor, "edited")
    })
    vi.spyOn(window, "confirm").mockReturnValue(false)
    await act(async () => { button(view.container, "Reload")?.click(); await Promise.resolve() })
    expect((view.container.querySelector("textarea") as HTMLTextAreaElement).value).toBe("edited")
    await act(async () => { button(view.container, "Save")?.click(); await Promise.resolve() })
    expect(write).toHaveBeenCalledWith(selection("a.md").location, "edited", "rev-a.md")
  })

  it("requires exact-path confirmation before delete and exposes Undo recovery", async () => {
    const remove = vi.fn(async () => ok({ recoveryToken: "recover-1", receipt: { committed: true, idempotencyKey: "delete", replayed: false } }))
    const recover = vi.fn(async () => ok({ location: selection("a.md").location, receipt: { committed: true, idempotencyKey: "recover", replayed: false } }))
    const view = mount(null)
    await view.render(<FileDetail selection={selection("a.md")} files={client({ delete: remove, recover })} />)
    await act(async () => { button(view.container, "Delete")?.click() })
    expect(view.container.textContent).toContain("root:a.md")
    await act(async () => { button(view.container, "Cancel")?.click() })
    expect(remove).not.toHaveBeenCalled()
    await act(async () => { button(view.container, "Delete")?.click() })
    await act(async () => { button(view.container, "Confirm delete")?.click(); await Promise.resolve() })
    expect(remove).toHaveBeenCalledTimes(1)
    await act(async () => { button(view.container, "Undo")?.click(); await Promise.resolve() })
    expect(recover).toHaveBeenCalledWith("recover-1")
  })

  it("renders markup and links as inert text without injecting HTML", async () => {
    const files = client({ read: async () => ok("<img src=x onerror=alert(1)> [link](https://example.com)") })
    const view = mount(null)
    await view.render(<FileDetail selection={selection("unsafe.md")} files={files} />)
    expect(view.container.querySelector("img")).toBeNull()
    expect(view.container.querySelector("a")).toBeNull()
    expect(view.container.textContent).toContain("<img src=x onerror=alert(1)>")
    expect(view.container.textContent).toContain("Links are disabled")
  })
})
