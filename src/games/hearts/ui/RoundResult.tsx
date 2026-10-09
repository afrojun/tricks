import type { Available, RoundSummary, View } from '../engine'
import type { Seat } from '../../../kit/table'
import { Again, TableNames } from '../../../ui/Again'
import { CoachReview } from '../../../ui/coach/CoachReview'
import { useCoach } from '../../../ui/coach/context'
import { useSession } from './session'
import { playSound } from '../../../ui/sound'
import { plural } from '../../../ui/text'
import { headline, nameFor, points, pointsWord, sortHand } from './text'

/** This round's points by seat and the totals after it, the reason when it ended unusually, and what comes next. */
export function RoundResult({ view, summary, winner, can }: { view: View; summary: RoundSummary; winner: Seat | null; can: Available }) {
  const { send } = useSession()
  // A drill ends with its round: its verdict says what next.
  const drilled = useCoach()?.state.drill != null
  const low = Math.min(...summary.scoresAfter)
  const you = (seat: Seat) => seat === view.seat
  if (winner !== null) return <GameOver view={view} summary={summary} winner={winner} can={can} />
  return (
    <section className="panel p-4 w-full max-w-sm grid gap-3">
      <h2 className="display text-xl">{`Round ${summary.roundNumber} is over`}</h2>
      <p>{headline(view, summary)}</p>

      <table className="w-full">
        <thead>
          <tr className="text-sm text-on-surface-muted">
            <th className="text-left font-normal">Player</th>
            <th className="text-right font-normal">This round</th>
            <th className="text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody>
          {summary.scoresAfter.map((total, seat) => (
            <tr key={seat} className={`border-t border-line/40 ${you(seat) ? 'font-semibold' : ''}`}>
              <td className="max-w-0 w-1/2 truncate">{nameFor(view, seat)}</td>
              <td className="text-right tabular-nums">{summary.points[seat] > 0 ? `+${summary.points[seat]}` : points(summary.points[seat])}</td>
              <td className={`text-right tabular-nums ${total === low ? 'text-accent' : ''}`}>{points(total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-on-surface-muted">Points are bad. When someone reaches {view.rules.gameEndsAt}, the fewest points wins.</p>

      <CoachReview view={view} shown={{ sort: sortHand }} />

      <TableNames view={view} />
      {drilled ? null : can.nextRound ? (
        <button className="btn btn-primary" onClick={() => {
            playSound('tap')
            send({ type: 'nextRound' })
          }}>
          Next round
        </button>
      ) : (
        <p className="text-on-surface-muted">Waiting for a player to start the next round.</p>
      )}
    </section>
  )
}

/** The game's end: who won, the final standings from fewest points up, how long it took, and the last round under it. */
function GameOver({ view, summary, winner, can }: { view: View; summary: RoundSummary; winner: Seat; can: Available }) {
  const { send } = useSession()
  const mine = winner === view.seat
  const standings = summary.scoresAfter.map((total, seat) => ({ seat, total })).sort((a, b) => a.total - b.total || a.seat - b.seat)
  return (
    <section className="panel p-4 w-full max-w-sm grid gap-3">
      <div>
        <p className="eyebrow">Game over</p>
        <h2 className="display text-2xl">{mine ? 'You win' : `${nameFor(view, winner)} wins`}</h2>
      </div>
      <p>
        {mine ? 'Well played: the' : 'The'} fewest points after {plural(summary.roundNumber, 'round')}, with {pointsWord(summary.scoresAfter[winner])}.
      </p>

      <table className="w-full">
        <tbody>
          {standings.map(({ seat, total }, place) => (
            <tr key={seat} className={`border-t border-line/40 ${seat === winner ? 'font-semibold text-accent' : ''}`}>
              <td className="w-8 pr-2 tabular-nums text-on-surface-muted">{place + 1}</td>
              <td className="max-w-0 w-full truncate">{nameFor(view, seat)}</td>
              <td className="text-right tabular-nums">{points(total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-on-surface-muted">Last round: {headline(view, summary)}</p>

      <CoachReview view={view} shown={{ sort: sortHand }} />

      <Again
        view={view}
        again={view.phase.kind === 'gameOver' ? view.phase.again : []}
        canAgain={can.again}
        canStart={can.rematch}
        onAgain={() => send({ type: 'rematch' })}
        onStart={() => send({ type: 'rematch', now: true })}
      />
    </section>
  )
}
