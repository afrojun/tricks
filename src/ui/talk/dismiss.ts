import { type RefObject, useEffect, useRef } from 'react'

/**
 * For a small dialog that opens from a button: focus moves to its first enabled button and stays
 * inside it, Escape closes it, and focus goes back to whatever opened it. A tap outside is the
 * dialog's own catcher.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return keepInside(e)
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close.current()
    }
    // Tab wraps around the dialog's buttons, so nothing under it can be reached while it is open.
    const keepInside = (e: KeyboardEvent) => {
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      if (buttons.length === 0) return
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next = at === -1 ? 0 : (at + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length
      e.preventDefault()
      buttons[next].focus({ preventScroll: true })
    }
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('keydown', onKey)
      opener?.focus({ preventScroll: true })
    }
  }, [ref])
}
