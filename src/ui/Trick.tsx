import { AnimatePresence, type TargetAndTransition, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { Card } from '../kit/cards'
import type { Seat } from '../kit/table'
import { PlayingCard } from './Card'
import type { ShellView } from './contract'
import { cardLayoutId } from './Hand'
import { usePosition } from './Seat'
import { TOWARD, type Where } from './seats'
import { seatName } from './text'

/** A card on the table, as every game's view shows it. */
export interface TrickPlay {
  seat: Seat
  card: Card
}

/** The round in play, as far as the trick area reads it: the trick being played, and those completed (only the last with its cards). */
export interface TrickRound {
  kind: 'playing' | 'trickPause'
  tricks: readonly { plays: readonly TrickPlay[]; winner: Seat }[]
  current: readonly TrickPlay[]
}

/** No trick yet: the area stays in its place, empty, under whatever panel the table shows. */
export const NO_TRICK: TrickRound = { kind: 'playing', tricks: [], current: [] }

const AREA: Record<Where, string> = { top: 'col-start-2 row-start-1', left: 'col-start-1 row-start-2', right: 'col-start-3 row-start-2', bottom: 'col-start-2 row-start-3' }

/** How long a won trick takes to be swept together and carried to its winner. */
export const GATHER_MS = 900

/**
 * Whether the round's last trick is still being gathered in, after the round ended with it on the
 * table: the round's result waits for it, and the table stays as it was meanwhile. Worked out
 * while drawing, so the trick is never taken off the table before it can leave.
 */
export function useGathering(ended: boolean, trickOnTable: boolean): boolean {
  const [before, setBefore] = useState({ ended, trickOnTable })
  const [gathering, setGathering] = useState(false)
  if (before.ended !== ended || before.trickOnTable !== trickOnTable) {
    setBefore({ ended, trickOnTable })
    setGathering(ended && !before.ended && before.trickOnTable)
  }
  useEffect(() => {
    if (!gathering) return
    const timer = setTimeout(() => setGathering(false), GATHER_MS)
    return () => clearTimeout(timer)
  }, [gathering])
  return gathering
}

/** A cell's offset from the middle of the cross, in thirds of the area. */
const CELL: Record<Where, { x: number; y: number }> = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }

/**
 * How far a seat's hand is from a card in the trick: to the fan of cards at their seat, or the
 * viewer's own hand, or failing either toward their side of the table.
 */
function toHand(area: HTMLElement | null, seat: Seat, mine: boolean, where: Where, cell: Where): { x: number; y: number } {
  const hand = mine ? document.querySelector('.hand') : document.querySelector(`[data-hand-of="${seat}"]`)
  if (!area || !hand) return TOWARD[where]
  const a = area.getBoundingClientRect()
  const h = hand.getBoundingClientRect()
  return {
    x: h.left + h.width / 2 - (a.left + a.width / 2) - (CELL[cell].x * a.width) / 3,
    y: h.top + h.height / 2 - (a.top + a.height / 2) - (CELL[cell].y * a.height) / 3,
  }
}

/**
 * The trick in the middle of the table. Each card arrives from its player's hand, and a finished
 * trick is shown with its winner ringed; when play goes on, its cards are swept into a pile in the
 * middle and the winner takes the pile into their hand. `wins` words the winner's line under the
 * cards, or leaves it out (null) for a game that says more elsewhere.
 */
export function TrickArea({ view, phase, wins }: { view: ShellView; phase: TrickRound; wins?: (winner: Seat) => string | null }) {
  const position = usePosition(view)
  const areaRef = useRef<HTMLDivElement>(null)
  const last = phase.tricks[phase.tricks.length - 1]
  const paused = phase.kind === 'trickPause' && last !== undefined
  const showing = paused ? last.plays : phase.current
  const winner = paused ? last.winner : null
  // The same number while a trick is being played and while it is shown complete, so its cards keep their identity.
  const trickNumber = paused ? phase.tricks.length - 1 : phase.tricks.length
  // Measured as each card moves, since the screen may have changed size while the trick was played.
  const hand = (seat: Seat, cell: Where) => toHand(areaRef.current, seat, seat === view.seat, position(seat), cell)
  const gather = (cell: Where): TargetAndTransition => {
    // Cards of a trick cut short, as when a challenge ends the round, are not anyone's: they go.
    if (!paused) return { opacity: 0 }
    const area = areaRef.current
    const middle = { x: (-CELL[cell].x * (area?.offsetWidth ?? 0)) / 3, y: (-CELL[cell].y * (area?.offsetHeight ?? 0)) / 3 }
    const to = hand(last.winner, cell)
    return {
      x: [null, middle.x, middle.x, to.x],
      y: [null, middle.y, middle.y, to.y],
      scale: [null, 0.9, 0.9, 0.4],
      opacity: [null, 1, 0],
      // Swept together, a beat as a pile, then carried off; it fades only as it reaches the hand.
      transition: { duration: GATHER_MS / 1000, times: [0, 0.35, 0.45, 1], ease: 'easeInOut', opacity: { duration: GATHER_MS / 1000, times: [0, 0.8, 1] } },
    }
  }
  return (
    <div ref={areaRef} className="trick-area" aria-label="Current trick">
      <AnimatePresence>
        {showing.map((play) => {
          const where = position(play.seat)
          const mine = play.seat === view.seat
          return (
            <motion.div
              key={`${trickNumber}-${play.seat}`}
              className={`relative ${AREA[where]} ${winner === play.seat ? 'winner-ring' : ''}`}
              // The winning card ends on top of the pile.
              style={{ zIndex: winner === play.seat ? 1 : undefined }}
              // The player's own card arrives from the hand by shared layout; others come from their seat.
              layoutId={mine ? cardLayoutId(play.card) : undefined}
              variants={{
                away: () => ({ ...hand(play.seat, where), opacity: 0, scale: 0.45 }),
                down: { x: 0, y: 0, opacity: 1, scale: 1 },
                taken: () => gather(where),
              }}
              initial={mine ? false : 'away'}
              animate="down"
              exit="taken"
            >
              <PlayingCard card={play.card} size="trick" />
              {play === showing[0] && <span className="led-tag">Led</span>}
            </motion.div>
          )
        })}
      </AnimatePresence>
      <p className="trick-cue" aria-live="polite">
        {winner !== null && (wins === undefined || wins(winner) !== null) && (
          <span className="cue">{wins ? wins(winner) : winner === view.seat ? 'You win it' : `${seatName(view, winner)} wins`}</span>
        )}
      </p>
    </div>
  )
}

/** The most recent completed trick only: what a player at the table could still picture. */
export function LastTrick({ view, playing }: { view: ShellView; playing: TrickRound | null }) {
  const trick = playing?.tricks[playing.tricks.length - 1]
  if (!trick) return <p>No trick has been completed this round.</p>
  return (
    <div className="grid gap-2">
      <p>
        Won by {trick.winner === view.seat ? 'you' : seatName(view, trick.winner)}. {trick.plays[0].seat === view.seat ? 'You' : seatName(view, trick.plays[0].seat)} led.
      </p>
      <div className="flex gap-2">
        {trick.plays.map((play) => (
          <div key={play.seat} className="grid justify-items-center gap-1">
            <span className={`inline-flex ${play.seat === trick.winner ? 'winner-ring' : ''}`}>
              <PlayingCard card={play.card} size="trick" />
            </span>
            <span className="text-xs truncate max-w-14">{play.seat === view.seat ? 'You' : seatName(view, play.seat)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
