import { type RefObject, useEffect, useRef } from 'react'

/**
 * For a small dialog that opens from a button: focus moves to its first enabled button, Escape
 * closes it, and focus goes back to whatever opened it. A tap outside is the dialog's own catcher.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close.current()
    }
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('keydown', onKey)
      opener?.focus({ preventScroll: true })
    }
  }, [ref])
}
