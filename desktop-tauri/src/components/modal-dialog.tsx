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
  const capturedTrigger = useRef<Element | null>(null)
  const latest = useRef({ initialFocusRef, restoreFocusTo, onRequestClose })

  // Callback updates must not restart modality or steal focus from an editor.
  useLayoutEffect(() => {
    latest.current = { initialFocusRef, restoreFocusTo, onRequestClose }
  })

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !open) return
    const cycle = ++openCycle.current
    const activeOnOpen = document.activeElement
    if (!dialog.contains(activeOnOpen)) capturedTrigger.current = activeOnOpen
    const trigger = capturedTrigger.current
    dialog.showModal()
    latest.current.initialFocusRef?.current?.focus({ preventScroll: true })

    let closeRequested = false
    const onCancel = (event: Event) => {
      event.preventDefault()
      if (closeRequested) return
      closeRequested = true
      latest.current.onRequestClose()
    }
    dialog.addEventListener("cancel", onCancel)
    return () => {
      dialog.removeEventListener("cancel", onCancel)
      const beforeClose = document.activeElement
      const workflowTarget = beforeClose !== trigger && !dialog.contains(beforeClose) ? beforeClose : null
      if (dialog.open) dialog.close()
      const nativeFocus = document.activeElement
      // Finish the React commit first; discard obsolete StrictMode/reopen
      // work and preserve any new external workflow focus after native close.
      queueMicrotask(() => {
        if (cycle !== openCycle.current) return
        const active = document.activeElement
        if (active !== nativeFocus && active !== document.body && active !== trigger && active?.isConnected && !dialog.contains(active)) return
        if (focusTarget(workflowTarget)) return
        if (!focusTarget(latest.current.restoreFocusTo())) focusTarget(trigger)
      })
    }
  }, [open])

  return (
    <dialog ref={dialogRef} aria-labelledby={labelledBy} className={className}>
      {children}
    </dialog>
  )
}

function focusTarget(target: Element | null): boolean {
  if (!(target instanceof HTMLElement) || !target.isConnected || target === document.body) return false
  if (target.matches(":disabled") || target.closest('[hidden], [inert], [aria-disabled="true"], [aria-hidden="true"]')) return false
  target.focus({ preventScroll: true })
  return document.activeElement === target
}
