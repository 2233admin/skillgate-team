// @vitest-environment jsdom
import { act } from "react"
import { createRef, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ModalDialog } from "./modal-dialog"
import { installDialogFixture, type DialogFixture } from "../test/dialog-fixture"

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let fixture: DialogFixture
const mounted: Array<{ container: HTMLDivElement; root: Root }> = []

beforeEach(() => {
  fixture = installDialogFixture()
})

// Research contract (#36): unmount React roots inside act() BEFORE the
// prototype descriptors are restored.
afterEach(async () => {
  for (const entry of mounted.splice(0)) {
    await act(async () => entry.root.unmount())
    entry.container.remove()
  }
  fixture.restore()
})

function mount(element: React.ReactNode) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  mounted.push({ container, root })
  return { container, root, render: async (next: React.ReactNode) => act(async () => root.render(next)) }
}

function dialogOf(container: HTMLElement) {
  return container.querySelector("dialog")!
}

// lib target predates Promise.withResolvers; same shape, no dependency bump.
function flushMacrotask() {
  return new Promise<void>((resolve) => { setTimeout(resolve, 0) })
}

function content(initialFocus: React.Ref<HTMLButtonElement>, titleId: string) {
  return (
    <>
      <h3 id={titleId}>Dialog title</h3>
      <button ref={initialFocus}>Cancel</button>
    </>
  )
}

describe("ModalDialog", () => {
  it("focuses the initial target and reflects modal open state", async () => {
    const view = mount(null)
    const initialFocus = createRef<HTMLButtonElement>()
    const trigger = document.createElement("button")
    trigger.textContent = "Open"
    document.body.append(trigger)
    await view.render(
      <ModalDialog open labelledBy="t" initialFocusRef={initialFocus} restoreFocusTo={() => trigger} onRequestClose={() => {}}>
        {content(initialFocus, "t")}
      </ModalDialog>,
    )
    expect(dialogOf(view.container).open).toBe(true)
    expect(dialogOf(view.container).getAttribute("aria-labelledby")).toBe("t")
    expect(document.activeElement).toBe(initialFocus.current)
  })

  it("prevents default on cancel and calls onRequestClose once, then controlled close restores focus", async () => {
    const view = mount(null)
    const initialFocus = createRef<HTMLButtonElement>()
    // createRoot clears the container on mount; the trigger lives on body,
    // mirroring production where the trigger sits outside the dialog tree.
    const trigger = document.createElement("button")
    document.body.append(trigger)
    const onRequestClose = vi.fn()
    const children = content(initialFocus, "t")
    const render = (open: boolean) =>
      view.render(
        <ModalDialog open={open} labelledBy="t" initialFocusRef={initialFocus} restoreFocusTo={() => trigger} onRequestClose={onRequestClose}>
          {children}
        </ModalDialog>,
      )
    await render(true)
    const dialog = dialogOf(view.container)
    const cancel = new Event("cancel", { cancelable: true })
    await act(async () => {
      dialog.dispatchEvent(cancel)
    })
    expect(cancel.defaultPrevented).toBe(true)
    expect(onRequestClose).toHaveBeenCalledTimes(1)
    await render(false)
    expect(dialog.open).toBe(false)
    // Focus restore is deferred (#36 contract): React's commit remounts the
    // focused child and steals synchronous restores, so the component
    // schedules one macrotask; await it inside act.
    await act(async () => { await flushMacrotask() })
    expect(document.activeElement).toBe(trigger)
    expect(onRequestClose).toHaveBeenCalledTimes(1)
  })

  it("refocuses the initial target on reopen and does not fire onRequestClose on controlled close", async () => {
    const view = mount(null)
    const initialFocus = createRef<HTMLButtonElement>()
    const trigger = document.createElement("button")
    document.body.append(trigger)
    const onRequestClose = vi.fn()
    const render = (open: boolean) =>
      view.render(
        <ModalDialog open={open} labelledBy="t" initialFocusRef={initialFocus} restoreFocusTo={() => trigger} onRequestClose={onRequestClose}>
          {content(initialFocus, "t")}
        </ModalDialog>,
      )
    await render(true)
    // Let the close cycle's deferred focus restore run before reopening.
    await act(async () => { await flushMacrotask() })
    await render(false)
    await act(async () => { await flushMacrotask() })
    await render(true)
    const dialog = dialogOf(view.container)
    expect(dialog.open).toBe(true)
    expect(document.activeElement).toBe(initialFocus.current)
    expect(onRequestClose).not.toHaveBeenCalled()
  })

  it("leaves focus alone when the restore target is disabled or detached", async () => {
    const view = mount(null)
    const initialFocus = createRef<HTMLButtonElement>()
    const disabledTrigger = document.createElement("button")
    disabledTrigger.disabled = true
    document.body.append(disabledTrigger)
    const detached = document.createElement("button")
    const cases: Array<() => HTMLElement | null> = [
      () => disabledTrigger,
      () => detached,
      () => null,
    ]
    for (const resolveTarget of cases) {
      await view.render(
        <ModalDialog open labelledBy="t" initialFocusRef={initialFocus} restoreFocusTo={resolveTarget} onRequestClose={() => {}}>
          {content(initialFocus, "t")}
        </ModalDialog>,
      )
      await view.render(
        <ModalDialog open={false} labelledBy="t" initialFocusRef={initialFocus} restoreFocusTo={resolveTarget} onRequestClose={() => {}}>
          {content(initialFocus, "t")}
        </ModalDialog>,
      )
      await act(async () => { await flushMacrotask() })
      expect(document.activeElement).not.toBe(disabledTrigger)
      expect(document.activeElement).not.toBe(detached)
    }
  })

  it("calls onRequestClose once even when two cancel events arrive in the same open cycle", async () => {
    const view = mount(null)
    const initialFocus = createRef<HTMLButtonElement>()
    const trigger = document.createElement("button")
    document.body.append(trigger)
    const onRequestClose = vi.fn()
    await view.render(
      <ModalDialog open labelledBy="t" initialFocusRef={initialFocus} restoreFocusTo={() => trigger} onRequestClose={onRequestClose}>
        {content(initialFocus, "t")}
      </ModalDialog>,
    )
    const dialog = dialogOf(view.container)
    await act(async () => {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }))
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }))
    })
    expect(onRequestClose).toHaveBeenCalledTimes(1)
  })

  it("does not restore focus to a disabled input or to document.body", async () => {
    const view = mount(null)
    const initialFocus = createRef<HTMLButtonElement>()
    const disabledInput = document.createElement("input")
    disabledInput.disabled = true
    document.body.append(disabledInput)
    await view.render(
      <ModalDialog open labelledBy="t" initialFocusRef={initialFocus} restoreFocusTo={() => disabledInput} onRequestClose={() => {}}>
        {content(initialFocus, "t")}
      </ModalDialog>,
    )
    await view.render(
      <ModalDialog open={false} labelledBy="t" initialFocusRef={initialFocus} restoreFocusTo={() => disabledInput} onRequestClose={() => {}}>
        {content(initialFocus, "t")}
      </ModalDialog>,
    )
    await act(async () => { await flushMacrotask() })
    expect(document.activeElement).not.toBe(disabledInput)
    await view.render(
      <ModalDialog open labelledBy="t" initialFocusRef={initialFocus} restoreFocusTo={() => document.body} onRequestClose={() => {}}>
        {content(initialFocus, "t")}
      </ModalDialog>,
    )
    await view.render(
      <ModalDialog open={false} labelledBy="t" initialFocusRef={initialFocus} restoreFocusTo={() => document.body} onRequestClose={() => {}}>
        {content(initialFocus, "t")}
      </ModalDialog>,
    )
    await act(async () => { await flushMacrotask() })
    expect(document.activeElement).not.toBe(document.body)
  })

  it("survives StrictMode double-effect replay without stealing focus to the trigger", async () => {
    const view = mount(null)
    const initialFocus = createRef<HTMLButtonElement>()
    const trigger = document.createElement("button")
    document.body.append(trigger)
    await view.render(
      <StrictMode>
        <ModalDialog open labelledBy="t" initialFocusRef={initialFocus} restoreFocusTo={() => trigger} onRequestClose={() => {}}>
          {content(initialFocus, "t")}
        </ModalDialog>
      </StrictMode>,
    )
    const dialog = dialogOf(view.container)
    expect(dialog.open).toBe(true)
    expect(document.activeElement).toBe(initialFocus.current)
  })
})
