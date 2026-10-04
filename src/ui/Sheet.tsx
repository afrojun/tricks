import { type ReactNode, useEffect } from 'react'

/** A bottom sheet. Closes on backdrop tap or Escape. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="panel sheet" role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="display text-xl">{title}</h2>
          <button className="btn btn-small" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
