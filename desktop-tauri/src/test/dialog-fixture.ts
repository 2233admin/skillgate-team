import { vi } from "vitest"

export type DialogFixture = { restore: () => void }

// jsdom 26.1.0 implements neither showModal nor close (verified against the
// pinned WebIDL in #36 research). This fixture installs minimal stand-ins on
// the prototype: they only flip the `open` reflection and, for close, emit a
// `close` event. It deliberately does NOT focus anything, trap Tab, implement
// inert, or model the browser event loop — focus assertions exercise the
// component's own policy. Call restore() after React roots are unmounted.
export function installDialogFixture(): DialogFixture {
  const prototype = HTMLDialogElement.prototype
  const savedShow = Object.getOwnPropertyDescriptor(prototype, "showModal")
  const savedClose = Object.getOwnPropertyDescriptor(prototype, "close")
  Object.defineProperties(prototype, {
    showModal: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = true
      }),
    },
    close: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        if (!this.open) return
        this.open = false
        this.dispatchEvent(new Event("close"))
      }),
    },
  })
  const restore = () => {
    if (savedShow) Object.defineProperty(prototype, "showModal", savedShow)
    else Reflect.deleteProperty(prototype, "showModal")
    if (savedClose) Object.defineProperty(prototype, "close", savedClose)
    else Reflect.deleteProperty(prototype, "close")
    vi.restoreAllMocks()
  }
  return { restore }
}
