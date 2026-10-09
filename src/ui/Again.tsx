import type { Seat } from '../kit/table'
import type { ShellView } from './contract'
import { playSound } from './sound'
import { againVoters, listNames } from './talk/choices'
import { useSaidAt } from './talk/hooks'
import { MutedTag, NamePill } from './talk/NameMenu'
import { TalkSaid } from './talk/Said'
import { seatName } from './text'

interface AgainProps {
  view: ShellView
  /** Who has said Again. */
  again: readonly Seat[]
  /** This seat may say Again: a person not yet in. */
  canAgain: boolean
  /** The host may start the next game now, without waiting. */
  canStart: boolean
  onAgain: () => void
  onStart: () => void
}

/**
 * The foot of a game-over panel, for any game. Everyone at the table as a name: those in wear an
 * In tag, and those still to say Again the yellow of "waiting on you". Tapping a name offers the
 * kind things only. Then Again, which stays pressed as "You're in", the host's quiet Start now,
 * and who is still to come. The next game starts by itself when the last one is in.
 */
export function Again({ view, again, canAgain, canStart, onAgain, onStart }: AgainProps) {
  const voters = againVoters(view.seats)
  const mine = view.seat !== null && again.includes(view.seat)
  const waiting = voters.filter((seat) => !again.includes(seat) && seat !== view.seat)
  return (
    <div className="grid gap-3">
      <TableNames view={view} again={again} />
      {(canAgain || mine || canStart) && (
        <div className="flex items-center gap-2">
          {(canAgain || mine) && (
            <button
              className="btn btn-primary flex-1"
              aria-pressed={mine}
              data-held={mine || undefined}
              onClick={() => {
                if (mine) return
                playSound('tap')
                onAgain()
              }}
            >
              {mine ? "You're in" : 'Again'}
            </button>
          )}
          {canStart && (
            <button
              className="btn btn-quiet btn-small"
              onClick={() => {
                playSound('tap')
                onStart()
              }}
            >
              Start now
            </button>
          )}
        </div>
      )}
      {(mine || !canAgain) && waiting.length > 0 && <p className="text-on-surface-muted">Waiting for {listNames(waiting.map((seat) => seatName(view, seat)))}.</p>}
    </div>
  )
}

/**
 * Everyone at the table as a name, for a result panel, where the seats are gone: what each says
 * shows over their name, and tapping it offers a throw. At game over (`again` given) the names
 * offer the kind things only, wear In once in, and the yellow of "waiting on you" until then.
 */
export function TableNames({ view, again }: { view: ShellView; again?: readonly Seat[] }) {
  const voters = again ? againVoters(view.seats) : []
  return (
    <ul className="again-names" aria-label="At the table">
      {view.seats.map(
        (s, seat) =>
          s.kind !== 'empty' && (
            <li key={seat} className="again-name">
              <NamePill view={view} seat={seat} turn={again !== undefined && voters.includes(seat) && !again.includes(seat)} over={again !== undefined} />
              {again?.includes(seat) && <span className="role-badge in-tag">In</span>}
              <MutedTag seat={seat} />
              <Said seat={seat} />
            </li>
          ),
      )}
    </ul>
  )
}

/** What a player says while the result is up, over their name: there are no seats on the table by then. */
function Said({ seat }: { seat: Seat }) {
  const talk = useSaidAt(seat)
  return (
    talk && (
      <span className="again-said">
        <TalkSaid key={talk.key} showing={talk} />
      </span>
    )
  )
}
