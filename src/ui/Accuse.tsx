import { Sheet } from './Sheet'

/** One accusation the player may make, worded by the game. */
export interface Accusation {
  key: string
  label: string
  send: () => void
}

/** The accuse sheet: what an accusation risks, then one button per accusation. Making one closes the sheet. */
export function AccuseSheet({ title, risk, accusations, onClose }: { title: string; risk: string; accusations: Accusation[]; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="grid gap-3">
        <p>{risk}</p>
        {accusations.map((accusation) => (
          <button
            key={accusation.key}
            className="btn btn-danger"
            onClick={() => {
              accusation.send()
              onClose()
            }}
          >
            {accusation.label}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
