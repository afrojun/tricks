import { Again, TableNames } from '../../../ui/Again'
import { CoachReview } from '../../../ui/coach/CoachReview'
import { useCoach } from '../../../ui/coach/context'
import { playSound } from '../../../ui/sound'
import { plural } from '../../../ui/text'
import { type Available, type Card, type RoundSummary, type SideResult, type View, seatsOf, sideOf } from '../engine'
import { sideColour } from './present'
import { useSession } from './session'
import { headline, nameFor, points, sideName, signed, sortHand, trickWord } from './text'

/** Each side's contract and tricks, its Nils, its bags, the round's points and the totals, and what comes next. */
export function RoundResult({ view, summary, winner, can }: { view: View; summary: RoundSummary; winner: number | null; can: Available }) {
  const { send } = useSession()
  // A drill ends with its round: its verdict says what next.
  const drilled = useCoach()?.state.drill != null
  if (winner !== null) return <GameOver view={view} summary={summary} winner={winner} can={can} />
  return (
    <section className="panel p-4 w-full max-w-sm grid gap-3">
      <div>
        <h2 className="display text-xl">{`Round ${summary.roundNumber} is over`}</h2>
        <p className="text-on-surface-muted">{headline(view, summary)}</p>
      </div>
      <SideTable view={view} summary={summary} totals bags />
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
        <p className="text-on-surface-muted">Waiting for someone to press Next round.</p>
      )}
    </section>
  )
}

type Tone = 'danger' | undefined

/**
 * Every side in a row: what it called, what it took, the round's points and, with `totals`, its score after, in
 * columns down the panel. Under each row, made or set as a tag, then only what else happened: a challenge's three,
 * a partner's Nil, bags gained, the ten-bag penalty, and with `bags` the count toward the next penalty.
 */
function SideTable({ view, summary, totals, bags }: { view: View; summary: RoundSummary; totals: boolean; bags: boolean }) {
  const mine = view.seat === null ? null : sideOf(view.seat, view.playerCount)
  const challenged = summary.reason === 'challenge'
  const columns = totals ? 5 : 4
  return (
    <table className="result-table w-full">
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Side</span>
          </th>
          <th scope="col">Called</th>
          <th scope="col">Took</th>
          <th scope="col">Scored</th>
          {totals && <th scope="col">Total</th>}
        </tr>
      </thead>
      {summary.sides.map((side, i) => {
        const r = outcome(side, challenged)
        return (
          <tbody key={i} className="border-t border-line/40" data-mine={i === mine || undefined}>
            <tr>
              <th scope="row" className="max-w-0 w-full">
                <span className="result-name">{sideName(view, i)}</span>
              </th>
              <td className="result-num">{r.called}</td>
              <td className="result-num">{r.took}</td>
              <td className="result-num" data-tone={side.points < 0 ? 'danger' : undefined}>
                {signed(side.points)}
              </td>
              {totals && (
                <td>
                  <b className="result-total tabular-nums" style={{ '--team': sideColour(i), '--on-team': `var(--on-team${i})` } as React.CSSProperties}>
                    {points(summary.scoresAfter[i])}
                  </b>
                </td>
              )}
            </tr>
            <tr>
              <td colSpan={columns} className="result-extras">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-on-surface-muted">
                  <span className="result-tag" data-tone={r.tone}>
                    {r.status}
                  </span>
                  {extras(view, side).map((e) => (
                    <span key={e.text} data-tone={e.tone}>
                      {e.text}
                    </span>
                  ))}
                  {bags && <Bags view={view} side={side} after={summary.bagsAfter[i]} />}
                </div>
              </td>
            </tr>
          </tbody>
        )
      })}
    </table>
  )
}

/** A side's row: its call and its tricks as the columns show them, and the one word that sums its round up. */
function outcome(side: SideResult, challenged: boolean): { called: string; took: string; status: string; tone: Tone } {
  // A challenge ends the round early: the tricks taken so far would mislead.
  const took = challenged ? '–' : String(side.contract > 0 ? side.tricks : side.nils.reduce((n, nil) => n + nil.tricks, 0))
  if (side.contract > 0) {
    const called = side.raised > 0 ? `${side.contract - side.raised}+${side.raised}` : String(side.contract)
    return side.made ? { called, took, status: 'Made', tone: undefined } : { called, took, status: 'Set', tone: 'danger' }
  }
  // Every player of the side called Nil.
  if (side.set) return { called: 'Nil', took, status: 'Set', tone: 'danger' }
  const made = side.nils.every((nil) => nil.points > 0)
  const failed = side.nils.some((nil) => nil.failed)
  return { called: 'Nil', took, status: made ? 'Made' : failed ? 'Lost to a challenge' : 'Broken', tone: made ? undefined : 'danger' }
}

/** What else happened to a side this round, an item each; nothing for a round with nothing to add. */
function extras(view: View, side: SideResult): { text: string; tone: Tone }[] {
  const items: { text: string; tone: Tone }[] = []
  if (side.raised > 0) items.push({ text: `+${side.raised} after a challenge`, tone: 'danger' })
  const lone = side.contract === 0 && side.nils.length === 1
  for (const nil of side.nils) {
    const what = nil.blind ? 'Blind nil' : 'Nil'
    // A lone Nil is the row itself: its tag and its points are there already.
    if (lone) {
      if (nil.blind) items.push({ text: what, tone: undefined })
      continue
    }
    const how = nil.points > 0 ? 'made' : side.set ? 'lost' : nil.failed ? 'lost to a challenge' : `broken by ${trickWord(nil.tricks)}`
    items.push({ text: `${nameFor(view, nil.seat)}: ${what} ${how}, ${signed(nil.points)}`, tone: nil.points > 0 ? undefined : 'danger' })
  }
  if (side.bags > 0) items.push({ text: `+${plural(side.bags, 'bag')}`, tone: undefined })
  if (side.bagPenalty < 0) items.push({ text: `Ten bags, ${signed(side.bagPenalty)}`, tone: 'danger' })
  return items
}

/** The side's bags toward the next penalty, as ten pips, those gained this round filling in; or the count in all. */
function Bags({ view, side, after }: { view: View; side: SideResult; after: number }) {
  if (!view.rules.bagPenalty) return <span className="ml-auto whitespace-nowrap">{plural(after, 'bag')} in all</span>
  const on = after % 10
  // Those gained this round, unless a penalty wiped the count: then it starts again.
  const fresh = side.bagPenalty < 0 ? 0 : Math.min(side.bags, on)
  return (
    <span className="ml-auto flex items-center gap-1.5 text-on-surface">
      <span className="text-xs text-on-surface-muted">Bags</span>
      <span className="pip-track" role="img" aria-label={`${on} of 10 bags`}>
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} data-on={i < on} data-fresh={i >= on - fresh && i < on} />
        ))}
      </span>
    </span>
  )
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
        <p className="text-on-surface-muted">{mine ? 'Well played: the' : 'The'} most points after {plural(summary.roundNumber, 'round')}.</p>
      </div>
      <ol className="grid gap-1.5" aria-label="Standings">
        {standings.map(({ side, total }, place) => (
          <li key={side} className="flex items-center gap-2" data-winner={side === winner || undefined}>
            <span className="w-5 tabular-nums text-on-surface-muted">{place + 1}</span>
            <span className={`flex-1 min-w-0 truncate ${side === winner ? 'font-extrabold' : 'font-semibold'}`}>{sideName(view, side)}</span>
            <b className="result-total result-total-lg tabular-nums" style={{ '--team': sideColour(side), '--on-team': `var(--on-team${side})` } as React.CSSProperties}>
              {points(total)}
            </b>
          </li>
        ))}
      </ol>
      <div className="grid gap-2">
        <div>
          <p className="eyebrow">Last round</p>
          <p className="text-sm text-on-surface-muted">{headline(view, summary)}</p>
        </div>
        <SideTable view={view} summary={summary} totals={false} bags={false} />
      </div>
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
