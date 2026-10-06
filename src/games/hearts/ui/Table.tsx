import { useState } from 'react'
import { type View, type ViewPhase } from '../engine'
import { cardId } from '../../../kit/cards'
import { PlayingCard } from '../../../ui/Card'
import { GameMenu } from '../../../ui/GameMenu'
import { RulesList, rulesSummary } from '../../../ui/Rules'
import { Sheet } from '../../../ui/Sheet'
import { useGameClient } from '../../../ui/session'
import { nameFor, sortHand } from './text'

const PASS_TO = { left: 'to the left', right: 'to the right', across: 'across' } as const

/** Where the round stands, in a line or two. */
function status(view: View, phase: Exclude<ViewPhase, { kind: 'lobby' }>): string {
  const name = (seat: number) => nameFor(view, seat)
  switch (phase.kind) {
    case 'passing': {
      const waiting = view.seats.map((_, seat) => seat).filter((seat) => !phase.chosen.includes(seat))
      const direction = view.direction === 'none' ? '' : ` ${PASS_TO[view.direction]}`
      return `Passing three cards${direction}. Still choosing: ${waiting.map(name).join(', ')}.`
    }
    case 'playing':
      return phase.turn === view.seat ? 'Your turn to play.' : `${name(phase.turn!)} to play.`
    case 'trickPause': {
      const winner = phase.tricks[phase.tricks.length - 1].winner
      return `${name(winner)} took the trick.`
    }
    case 'roundResult': {
      const { moon } = phase.summary
      return `${moon === null ? 'The round is over.' : `${name(moon)} shot the moon.`} Waiting for the next round to be dealt.`
    }
    case 'gameOver':
      return `${name(phase.winner)} won the game.`
  }
}

/**
 * Until Hearts has a table of its own: the public facts of the game as it goes, and the viewer's
 * hand, with nothing to tap. The shared menu lets the computer play for anyone who is away.
 */
export function Table({ view, room }: { view: View; room: string }) {
  const game = useGameClient()
  const [sheet, setSheet] = useState<'menu' | 'rules' | null>(null)
  const phase = view.phase
  if (phase.kind === 'lobby') return null
  const name = (seat: number) => nameFor(view, seat)
  const taken = 'taken' in phase ? phase.taken : 'summary' in phase ? phase.summary.points : null
  const trick = phase.kind === 'playing' ? phase.current : phase.kind === 'trickPause' ? phase.tricks[phase.tricks.length - 1].plays : []
  const hand = 'hand' in phase ? sortHand(phase.hand) : []
  const standIn = view.seat !== null && view.seats[view.seat].standIn

  return (
    <main className="min-h-full flex flex-col items-center gap-4 p-4 pb-10">
      <header className="w-full max-w-sm flex items-center justify-between mt-2">
        <h1 className="display text-2xl text-accent">{game.name}</h1>
        <button className="btn btn-quiet btn-small" onClick={() => setSheet('menu')} aria-label="Open menu">
          Menu
        </button>
      </header>
      <p className="w-full max-w-sm text-muted">The Hearts table is being built. Until it is ready, this page follows the game as it goes.</p>

      <section className="panel p-4 w-full max-w-sm grid gap-2" aria-live="polite">
        <h2 className="display text-lg">Round {view.roundNumber}</h2>
        <p>{status(view, phase)}</p>
        {'heartsBroken' in phase && <p>{phase.heartsBroken ? 'Hearts are broken.' : 'Hearts are not broken yet.'}</p>}
        {standIn && <p>The computer is playing for you.</p>}
      </section>

      <section className="panel p-4 w-full max-w-sm grid gap-2">
        <h2 className="display text-lg">Scores</h2>
        <table className="w-full">
          <thead>
            <tr className="text-sm text-on-surface-muted">
              <th className="text-left font-normal">Player</th>
              <th className="text-right font-normal">This round</th>
              <th className="text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {view.seats.map((_, seat) => (
              <tr key={seat} className="border-t border-line/40">
                <td className={phase.kind === 'playing' && phase.turn === seat ? 'font-semibold text-accent' : ''}>{name(seat)}</td>
                <td className="text-right tabular-nums">{taken?.[seat] ?? 0}</td>
                <td className="text-right tabular-nums">{view.scores[seat]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-on-surface-muted">Points are bad. The game ends when someone reaches {view.rules.gameEndsAt}.</p>
      </section>

      {trick.length > 0 && (
        <section className="panel p-4 w-full max-w-sm grid gap-2" aria-label="Current trick">
          <h2 className="display text-lg">{phase.kind === 'trickPause' ? 'The trick just taken' : 'On the table'}</h2>
          <div className="flex flex-wrap gap-3">
            {trick.map((play) => (
              <div key={play.seat} className="grid justify-items-center gap-1">
                <PlayingCard card={play.card} size="small" />
                <span className="text-xs truncate max-w-14">{name(play.seat)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {hand.length > 0 && (
        <section className="panel p-4 w-full max-w-sm grid gap-2" aria-label="Your hand">
          <h2 className="display text-lg">Your hand</h2>
          <div className="flex flex-wrap gap-1">
            {hand.map((card) => (
              <PlayingCard key={cardId(card)} card={card} size="small" />
            ))}
          </div>
        </section>
      )}

      {sheet === 'menu' && (
        <Sheet title="Menu" onClose={() => setSheet(null)}>
          <GameMenu
            view={view}
            intro={
              <p className="text-on-surface-muted">
                Game {room}, round {view.roundNumber}. {rulesSummary(game, view.rules)}.
              </p>
            }
            actions={
              <button className="btn btn-small" onClick={() => setSheet('rules')}>
                Rules in this game
              </button>
            }
          />
        </Sheet>
      )}
      {sheet === 'rules' && (
        <Sheet title="Rules in this game" onClose={() => setSheet(null)}>
          <RulesList game={game} rules={view.rules} />
        </Sheet>
      )}
    </main>
  )
}
