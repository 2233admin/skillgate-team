export type DialogFixture = { restore: () => void }

// jsdom 26 lacks these methods. This fixture changes only open/close state;
// it does not simulate focus, modality, keyboard trapping, or layout.
// Unmount React roots before restoring the prototype descriptors.
export function installDialogFixture(): DialogFixture {
  const prototype = HTMLDialogElement.prototype
  const savedShow = Object.getOwnPropertyDescriptor(prototype, "showModal")
  const savedClose = Object.getOwnPropertyDescriptor(prototype, "close")
  Object.defineProperties(prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) { this.open = true },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        if (!this.open) return
        this.open = false
        this.dispatchEvent(new Event("close"))
      },
    },
  })
  return {
    restore() {
      if (savedShow) Object.defineProperty(prototype, "showModal", savedShow)
      else Reflect.deleteProperty(prototype, "showModal")
      if (savedClose) Object.defineProperty(prototype, "close", savedClose)
      else Reflect.deleteProperty(prototype, "close")
    },
  }
}

