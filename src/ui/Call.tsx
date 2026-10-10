/**
 * Calling a number, for any game that calls one: Thunee's points, Spades' tricks, and later Call Break's and
 * Oh Hell's. A few calls are buttons that say what they call, two to a row ("Call 30"); many are numbers alone,
 * as many to a row as fit, so a phone shows two or three rows. Calls with names of their own sit in the grid's
 * last cells (Thunee's Pass) or under it, the full width (Spades' Nil).
 */
export interface NamedCall {
  label: string
  onClick: () => void
  /** A call that risks much, such as Blind nil, is drawn in the danger colour. */
  danger?: boolean
}

interface CallGridProps {
  numbers: readonly number[]
  onCall: (n: number) => void
  /** What a number says: "Call 30", "Call 4 tricks". On the button with `spelled`, otherwise to a screen reader. */
  label: (n: number) => string
  /** Few calls, each a full button that says what it calls, two to a row. */
  spelled?: boolean
  /** Calls in the grid's last cells. */
  inline?: readonly NamedCall[]
  /** Calls under the grid, each the full width. */
  named?: readonly NamedCall[]
}

export function CallGrid({ numbers, onCall, label, spelled = false, inline = [], named = [] }: CallGridProps) {
  const size = spelled ? '' : 'btn-small !px-1'
  return (
    <div className="grid gap-2">
      <div className={spelled ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-[repeat(auto-fill,minmax(2.6rem,1fr))] gap-1.5'}>
        {numbers.map((n) =>
          spelled ? (
            <button key={n} className="btn btn-primary" onClick={() => onCall(n)}>
              {label(n)}
            </button>
          ) : (
            <button key={n} className={`btn btn-primary ${size} tabular-nums`} onClick={() => onCall(n)} aria-label={label(n)}>
              {n}
            </button>
          ),
        )}
        {inline.map((call) => (
          <button key={call.label} className={`btn ${size} ${call.danger ? 'btn-danger' : ''}`} onClick={call.onClick}>
            {call.label}
          </button>
        ))}
      </div>
      {named.map((call) => (
        <button key={call.label} className={`btn btn-small ${call.danger ? 'btn-danger' : ''}`} onClick={call.onClick}>
          {call.label}
        </button>
      ))}
    </div>
  )
}
