import type { Available, RoundSummary, View } from '../engine'
import type { Seat } from '../../../kit/table'
import { CoachReview } from '../../../ui/coach/CoachReview'
import { useSession } from './session'
import { playSound } from '../../../ui/sound'
import { headline, nameFor, points, sortHand } from './text'

/** This round's points by seat and the totals after it, the reason when it ended unusually, and what comes next. */
export function RoundResult({ view, summary, winner, can }: { view: View; summary: RoundSummary; winner: Seat | null; can: Available }) {
  const { send } = useSession()
  const low = Math.min(...summary.scoresAfter)
  const you = (seat: Seat) => seat === view.seat
  return (
    <section className="panel p-4 w-full max-w-sm grid gap-3">
      <h2 className="display text-xl">
        {winner !== null ? `${nameFor(view, winner)} ${you(winner) ? 'win' : 'wins'} the game` : `Round ${summary.roundNumber} is over`}
      </h2>
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

      {winner === null ? (
        can.nextRound ? (
          <button className="btn btn-primary" onClick={() => {
              playSound('tap')
              send({ type: 'nextRound' })
            }}>
            Next round
          </button>
        ) : (
          <p className="text-on-surface-muted">Waiting for a player to start the next round.</p>
        )
      ) : can.rematch ? (
        <button className="btn btn-primary" onClick={() => {
              playSound('tap')
              send({ type: 'rematch' })
            }}>
          Play again
        </button>
      ) : (
        <p className="text-on-surface-muted">{you(winner) ? 'Well played.' : 'Better luck next game.'} The host can start another.</p>
      )}
    </section>
  )
}
