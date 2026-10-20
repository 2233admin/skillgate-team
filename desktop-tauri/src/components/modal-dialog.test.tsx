// @vitest-environment jsdom
import { act, createRef, StrictMode, type ComponentProps } from "react"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ModalDialog } from "./modal-dialog"
import { installDialogFixture, type DialogFixture } from "../test/dialog-fixture"

globalThis.IS_REACT_ACT_ENVIRONMENT = true

type Props = ComponentProps<typeof ModalDialog>
let fixture: DialogFixture
const mounted: Array<{ wrapper: HTMLDivElement; root: Root }> = []

beforeEach(() => {
  vi.useFakeTimers()
  fixture = installDialogFixture()
})

afterEach(async () => {
  for (const entry of mounted.splice(0)) {
    await act(async () => {
      entry.root.unmount()
      await vi.runAllTimersAsync()
    })
    entry.wrapper.remove()
  }
  fixture.restore()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function mount() {
  const wrapper = document.createElement("div")
  const container = document.createElement("div")
  const trigger = document.createElement("button")
  const fallback = document.createElement("button")
  trigger.textContent = "Open"
  fallback.textContent = "Workspace"
  wrapper.append(trigger, fallback, container)
  document.body.append(wrapper)
  const root = createRoot(container)
  mounted.push({ wrapper, root })
  const initial = createRef<HTMLButtonElement>()
  const onRequestClose = vi.fn()
  const element = (open: boolean, props: Partial<Props> = {}) => (
    <ModalDialog open={open} labelledBy="dialog-title" initialFocusRef={initial} restoreFocusTo={() => trigger} onRequestClose={onRequestClose} {...props}>
      <h3 id="dialog-title">Confirm action</h3>
      <button ref={initial}>Cancel</button>
    </ModalDialog>
  )
  const render = async (open: boolean, props: Partial<Props> = {}) => {
    await act(async () => root.render(element(open, props)))
  }
  return { wrapper, container, root, trigger, fallback, initial, onRequestClose, element, render }
}

async function flushRestore() {
  await act(async () => { await vi.runAllTimersAsync() })
}

describe("ModalDialog", () => {
  it("opens with labelled initial focus and does not dismiss on backdrop clicks", async () => {
    const view = mount()
    view.trigger.focus()
    await view.render(false)
    expect(document.activeElement).toBe(view.trigger)
    await view.render(true)
    const dialog = view.container.querySelector("dialog")!
    expect(dialog.open).toBe(true)
    expect(dialog.getAttribute("aria-labelledby")).toBe("dialog-title")
    expect(document.activeElement).toBe(view.initial.current)
    await act(async () => dialog.click())
    expect(view.onRequestClose).not.toHaveBeenCalled()
    expect(dialog.open).toBe(true)
  })

  it("requests close once per opening, prevents native cancel, and restores on controlled close", async () => {
    const view = mount()
    view.trigger.focus()
    await view.render(true)
    const dialog = view.container.querySelector("dialog")!
    const cancel = new Event("cancel", { cancelable: true })
    await act(async () => {
      dialog.dispatchEvent(cancel)
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }))
    })
    expect(cancel.defaultPrevented).toBe(true)
    expect(view.onRequestClose).toHaveBeenCalledTimes(1)
    expect(dialog.open).toBe(true)
    await view.render(false)
    await flushRestore()
    expect(dialog.open).toBe(false)
    expect(document.activeElement).toBe(view.trigger)
    await view.render(true)
    await act(async () => dialog.dispatchEvent(new Event("cancel", { cancelable: true })))
    expect(view.onRequestClose).toHaveBeenCalledTimes(2)
  })

  it("uses the latest resolver and callback without closing or refocusing on a parent rerender", async () => {
    const view = mount()
    view.trigger.focus()
    await view.render(true)
    const dialog = view.container.querySelector("dialog")!
    const editing = document.createElement("input")
    dialog.append(editing)
    editing.focus()
    const onRequestClose = vi.fn()
    const props = { restoreFocusTo: () => view.fallback, onRequestClose }
    await view.render(true, props)
    expect(dialog.open).toBe(true)
    expect(document.activeElement).toBe(editing)
    await act(async () => dialog.dispatchEvent(new Event("cancel", { cancelable: true })))
    expect(onRequestClose).toHaveBeenCalledTimes(1)
    expect(view.onRequestClose).not.toHaveBeenCalled()
    await view.render(false, props)
    await flushRestore()
    expect(document.activeElement).toBe(view.fallback)
  })

  it("resolves a replacement target on the same commit that closes the dialog", async () => {
    const view = mount()
    view.trigger.focus()
    await view.render(true)
    await view.render(false, { restoreFocusTo: () => view.fallback })
    await flushRestore()
    expect(document.activeElement).toBe(view.fallback)
    expect(view.onRequestClose).not.toHaveBeenCalled()
  })

  it.each(["null", "detached", "disabled", "body", "unfocusable"])("falls back to the real pre-open trigger when the resolver returns %s", async (kind) => {
    const view = mount()
    const candidate = document.createElement(kind === "unfocusable" ? "div" : "input")
    if (kind === "disabled") candidate.setAttribute("disabled", "")
    if (kind !== "detached") view.wrapper.append(candidate)
    const target = kind === "null" ? null : kind === "body" ? document.body : candidate
    view.trigger.focus()
    const props = { restoreFocusTo: () => target }
    await view.render(true, props)
    await view.render(false, props)
    await flushRestore()
    expect(document.activeElement).toBe(view.trigger)
  })

  it("returns to a workspace fallback when the trigger has been removed", async () => {
    const view = mount()
    view.trigger.focus()
    await view.render(true)
    view.trigger.remove()
    await view.render(false, { restoreFocusTo: () => view.fallback })
    await flushRestore()
    expect(document.activeElement).toBe(view.fallback)
  })

  it("preserves an intentional external workflow focus on close", async () => {
    const view = mount()
    view.trigger.focus()
    await view.render(true)
    await view.render(false)
    view.fallback.focus()
    await flushRestore()
    expect(document.activeElement).toBe(view.fallback)
  })

  it("does not let a pending close restore steal focus after an immediate reopen", async () => {
    const view = mount()
    view.trigger.focus()
    await view.render(true)
    await act(async () => {
      flushSync(() => view.root.render(view.element(false)))
      flushSync(() => view.root.render(view.element(true)))
      await vi.runAllTimersAsync()
    })
    expect(view.container.querySelector("dialog")!.open).toBe(true)
    expect(document.activeElement).toBe(view.initial.current)
  })

  it("does not steal focus after StrictMode replay and flushing pending restores", async () => {
    const view = mount()
    view.trigger.focus()
    await act(async () => view.root.render(<StrictMode>{view.element(true)}</StrictMode>))
    await flushRestore()
    expect(view.container.querySelector("dialog")!.open).toBe(true)
    expect(document.activeElement).toBe(view.initial.current)
  })

  it("retains the original trigger through StrictMode replay for a later invalid resolver", async () => {
    const view = mount()
    const props = { restoreFocusTo: () => null }
    view.trigger.focus()
    await act(async () => view.root.render(<StrictMode>{view.element(true, props)}</StrictMode>))
    await flushRestore()
    await act(async () => view.root.render(<StrictMode>{view.element(false, props)}</StrictMode>))
    await flushRestore()
    expect(document.activeElement).toBe(view.trigger)
  })

  it("uses the latest resolver even when native close already returned to the original trigger", async () => {
    const view = mount()
    view.trigger.focus()
    await view.render(true)
    const dialog = view.container.querySelector("dialog")!
    vi.spyOn(dialog, "close").mockImplementation(() => {
      dialog.open = false
      view.trigger.focus()
    })
    await view.render(false, { restoreFocusTo: () => view.fallback })
    await flushRestore()
    expect(document.activeElement).toBe(view.fallback)
  })

  it("preserves a workflow target set before native close returns focus to the trigger", async () => {
    const view = mount()
    view.trigger.focus()
    await view.render(true)
    const dialog = view.container.querySelector("dialog")!
    vi.spyOn(dialog, "close").mockImplementation(() => {
      dialog.open = false
      view.trigger.focus()
    })
    view.fallback.focus()
    await view.render(false)
    await flushRestore()
    expect(document.activeElement).toBe(view.fallback)
  })

  it("closes and restores focus when unmounted while open", async () => {
    const view = mount()
    view.trigger.focus()
    await view.render(true)
    const dialog = view.container.querySelector("dialog")!
    await act(async () => view.root.render(null))
    await flushRestore()
    expect(dialog.open).toBe(false)
    expect(document.activeElement).toBe(view.trigger)
  })
})
