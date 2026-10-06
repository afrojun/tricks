import { AnimatePresence, motion } from 'motion/react'
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

const AREA: Record<Where, string> = { top: 'col-start-2 row-start-1', left: 'col-start-1 row-start-2', right: 'col-start-3 row-start-2', bottom: 'col-start-2 row-start-3' }

/**
 * The trick in the middle of the table. Each card arrives from its player's side, and a finished
 * trick is shown with its winner ringed, then leaves toward them. `wins` words the winner's line.
 */
export function TrickArea({ view, phase, wins }: { view: ShellView; phase: TrickRound; wins?: (winner: Seat) => string }) {
  const position = usePosition(view)
  const last = phase.tricks[phase.tricks.length - 1]
  const paused = phase.kind === 'trickPause' && last !== undefined
  const showing = paused ? last.plays : phase.current
  const winner = paused ? last.winner : null
  // The same number while a trick is being played and while it is shown complete, so its cards keep their identity.
  const trickNumber = paused ? phase.tricks.length - 1 : phase.tricks.length
  // A finished trick leaves toward whoever won it.
  const exitTo = last ? TOWARD[position(last.winner)] : { x: 0, y: 0 }
  return (
    <div className="trick-area" aria-label="Current trick">
      <AnimatePresence custom={exitTo}>
        {showing.map((play) => {
          const where = position(play.seat)
          const mine = play.seat === view.seat
          const from = TOWARD[where]
          return (
            <motion.div
              key={`${trickNumber}-${play.seat}`}
              className={`relative ${AREA[where]}`}
              // The player's own card arrives from the hand by shared layout; others come from their seat.
              layoutId={mine ? cardLayoutId(play.card) : undefined}
              custom={exitTo}
              variants={{
                away: { x: from.x * 0.6, y: from.y * 0.6, opacity: 0, scale: 0.8 },
                down: { x: 0, y: 0, opacity: 1, scale: 1 },
                taken: (to: { x: number; y: number }) => ({ x: to.x, y: to.y, opacity: 0, scale: 0.5 }),
              }}
              initial={mine ? false : 'away'}
              animate="down"
              exit="taken"
            >
              <PlayingCard card={play.card} size="trick" className={winner === play.seat ? 'winner-ring' : ''} />
              {play === showing[0] && <span className="led-tag">Led</span>}
            </motion.div>
          )
        })}
      </AnimatePresence>
      {winner !== null && (
        <p className="col-start-2 row-start-2 text-center text-sm text-accent">
          {wins ? wins(winner) : winner === view.seat ? 'You win it' : `${seatName(view, winner)} wins`}
        </p>
      )}
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
            <PlayingCard card={play.card} size="trick" className={play.seat === trick.winner ? 'winner-ring' : ''} />
            <span className="text-xs truncate max-w-14">{play.seat === view.seat ? 'You' : seatName(view, play.seat)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
