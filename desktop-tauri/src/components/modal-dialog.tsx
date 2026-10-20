import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react"

export function ModalDialog({
  open,
  labelledBy,
  initialFocusRef,
  restoreFocusTo,
  onRequestClose,
  className,
  children,
}: {
  open: boolean
  labelledBy: string
  initialFocusRef?: RefObject<HTMLElement | null>
  restoreFocusTo: () => HTMLElement | null
  onRequestClose: () => void
  className?: string
  children?: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openCycle = useRef(0)

  // Controlled lifecycle: React never sets the `open` attribute; this effect
  // drives showModal()/close() so native modality (focus trap, top layer,
  // Escape via cancel) is the only mechanism. jsdom lacks both methods until
  // the test fixture installs them.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !open) return
    const cycle = ++openCycle.current
    const trigger = restoreFocusTo()
    dialog.showModal()
    const target = initialFocusRef?.current ?? dialog
    target.focus({ preventScroll: true })

    let closeRequested = false
    const onCancel = (event: Event) => {
      // Escape arrives as a cancelable `cancel` event; take it over so the
      // parent's onRequestClose is the single close path — once per cycle.
      event.preventDefault()
      if (cycle !== openCycle.current || closeRequested) return
      closeRequested = true
      onRequestClose()
    }
    dialog.addEventListener("cancel", onCancel)
    return () => {
      dialog.removeEventListener("cancel", onCancel)
      if (cycle !== openCycle.current) return undefined
      const restore = () => {
        if (cycle !== openCycle.current) return
        const el = eligible(restoreFocusTo()) ?? eligible(trigger)
        el?.focus({ preventScroll: true })
      }
      const timeout = setTimeout(restore, 0)
      if (dialog.open) dialog.close()
      return () => clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restoreFocusTo is only read at open (trigger capture) and close (final resolution); mid-open identity changes must not re-run the modal lifecycle.
  }, [open, initialFocusRef, onRequestClose])

  return (
    <dialog ref={dialogRef} aria-labelledby={labelledBy} className={className}>
      {children}
    </dialog>
  )
}

// Never restore focus to body, and only to a focusable, enabled element.
function eligible(el: HTMLElement | null | undefined): HTMLElement | null {
  if (!el || !el.isConnected || el === document.body) return null
  if (el instanceof HTMLButtonElement && el.disabled) return null
  if (el instanceof HTMLInputElement && el.disabled) return null
  return el
}
