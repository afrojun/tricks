import { Again, TableNames } from '../../../ui/Again'
import { CoachReview } from '../../../ui/coach/CoachReview'
import { useCoach } from '../../../ui/coach/context'
import { playSound } from '../../../ui/sound'
import { plural } from '../../../ui/text'
import { type Available, type Card, type RoundSummary, type SideResult, type View, seatsOf, sideOf } from '../engine'
import { useSession } from './session'
import { headline, nameFor, points, pointsWord, sideName, signed, sortHand, trickWord } from './text'

/** Each side's contract and tricks, its Nils, its bags, the round's points and the totals, and what comes next. */
export function RoundResult({ view, summary, winner, can }: { view: View; summary: RoundSummary; winner: number | null; can: Available }) {
  const { send } = useSession()
  // A drill ends with its round: its verdict says what next.
  const drilled = useCoach()?.state.drill != null
  if (winner !== null) return <GameOver view={view} summary={summary} winner={winner} can={can} />
  return (
    <section className="panel p-4 w-full max-w-sm grid gap-3">
      <h2 className="display text-xl">{`Round ${summary.roundNumber} is over`}</h2>
      <p>{headline(view, summary)}</p>
      <SideBlocks view={view} summary={summary} />
      <CoachReview view={view} shown={{ sort: (hand: readonly Card[]) => sortHand(hand, view.rules.jokers) }} />
      <TableNames view={view} />
      {drilled ? null : can.nextRound ? (
        <button
          className="btn btn-primary"
          onClick={() => {
            playSound('tap')
            send({ type: 'nextRound' })
          }}
        >
          Next round
        </button>
      ) : (
        <p className="text-on-surface-muted">Waiting for a player to start the next round.</p>
      )}
    </section>
  )
}

/** One block per side, the viewer's in bold. */
function SideBlocks({ view, summary }: { view: View; summary: RoundSummary }) {
  const mine = view.seat === null ? null : sideOf(view.seat, view.playerCount)
  return (
    <div className="grid gap-2">
      {summary.sides.map((side, i) => (
        <div key={i} className={`border-t border-line/40 pt-2 grid gap-0.5 ${i === mine ? 'font-semibold' : ''}`}>
          <p className="flex justify-between gap-2">
            <span className="truncate">{sideName(view, i)}</span>
            <span className="tabular-nums">
              {signed(side.points)} <span className="text-on-surface-muted font-normal">· {points(summary.scoresAfter[i])}</span>
            </span>
          </p>
          <ul className="text-sm text-on-surface-muted font-normal grid gap-0.5">
            {sideLines(view, side, summary.bagsAfter[i]).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** What made up a side's points, a line each. */
function sideLines(view: View, side: SideResult, bagsAfter: number): string[] {
  const lines: string[] = []
  if (side.contract > 0) {
    const called = side.contract - side.raised
    const raised = side.raised > 0 ? ` (and ${side.raised} for a renege)` : ''
    if (side.set) lines.push(`Called ${called}${raised}: set by the challenge, ${signed(-10 * side.contract)}`)
    else if (!side.made) lines.push(`Called ${called}${raised}, took ${side.tricks}: set, ${signed(-10 * side.contract)}`)
    else lines.push(`Called ${called}${raised}, took ${side.tricks}: made, ${signed(10 * side.contract)}`)
  }
  for (const nil of side.nils) {
    const what = nil.blind ? 'Blind nil' : 'Nil'
    const how = nil.points > 0 ? 'made' : nil.failed ? 'lost to a renege' : `broken with ${trickWord(nil.tricks)}`
    lines.push(`${nameFor(view, nil.seat)}: ${what} ${how}, ${signed(nil.points)}`)
  }
  if (side.bags > 0) lines.push(`${plural(side.bags, 'bag')}, ${signed(side.bags)}`)
  if (side.bagPenalty < 0) lines.push(`Ten bags: ${signed(side.bagPenalty)}`)
  lines.push(view.rules.bagPenalty ? `${plural(bagsAfter % 10, 'bag')} now, penalty at 10` : `${plural(bagsAfter, 'bag')} in all`)
  return lines
}

/** The game's end: who won, the standings from the highest down, and the last round under it. */
function GameOver({ view, summary, winner, can }: { view: View; summary: RoundSummary; winner: number; can: Available }) {
  const { send } = useSession()
  const mine = view.seat !== null && sideOf(view.seat, view.playerCount) === winner
  const pair = seatsOf(winner, view.playerCount).length > 1
  const standings = summary.scoresAfter.map((total, side) => ({ side, total })).sort((a, b) => b.total - a.total || a.side - b.side)
  return (
    <section className="panel p-4 w-full max-w-sm grid gap-3">
      <div>
        <p className="eyebrow">Game over</p>
        <h2 className="display text-2xl">{mine ? (pair ? `${sideName(view, winner)} win` : 'You win') : `${sideName(view, winner)} ${pair ? 'win' : 'wins'}`}</h2>
      </div>
      <p>
        {mine ? 'Well played: the' : 'The'} most points after {plural(summary.roundNumber, 'round')}, with {pointsWord(summary.scoresAfter[winner])}.
      </p>
      <table className="w-full">
        <tbody>
          {standings.map(({ side, total }, place) => (
            <tr key={side} className={`border-t border-line/40 ${side === winner ? 'font-semibold text-accent' : ''}`}>
              <td className="w-8 pr-2 tabular-nums text-on-surface-muted">{place + 1}</td>
              <td className="max-w-0 w-full truncate">{sideName(view, side)}</td>
              <td className="text-right tabular-nums">{points(total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-on-surface-muted">Last round: {headline(view, summary)}</p>
      <CoachReview view={view} shown={{ sort: (hand: readonly Card[]) => sortHand(hand, view.rules.jokers) }} />
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

