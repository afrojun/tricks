import { type ReactNode, useState } from 'react'
import { Link } from './Link'
import { Sheet } from './Sheet'
import { ThemePicker } from './ThemePicker'

/** The Tricks mark and name, a link to the Tricks home. */
export function TricksLink() {
  return (
    <Link href="/" className="flex items-center gap-2 display text-xl">
      <img src="/favicon.svg?v=2" alt="" width={28} height={28} className="tricks-mark tricks-mark-small" />
      Tricks
    </Link>
  )
}

/** The bar on top of a home: `left` (the Tricks link on a game's home), then `right` and "Look". */
export function TopBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  const [look, setLook] = useState(false)
  return (
    <header className="home-width flex items-center justify-between gap-2">
      <div>{left}</div>
      <div className="flex gap-2">
        {right}
        <button className="btn btn-quiet btn-small" onClick={() => setLook(true)}>
          Look
        </button>
      </div>
      {look && (
        <Sheet title="Look" onClose={() => setLook(false)}>
          <ThemePicker />
        </Sheet>
      )}
    </header>
  )
}
