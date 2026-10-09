import { type Available, type Card, type RoundSummary, type ScoreLine, type Team, type View, teamOf } from '../engine'
import { Again, TableNames } from '../../../ui/Again'
import { CoachReview } from '../../../ui/coach/CoachReview'
import { useCoach } from '../../../ui/coach/context'
import type { DealShown } from '../../../ui/coach/CoachSheets'
import { useSession } from './session'
import { playSound } from '../../../ui/sound'
import { SUIT_NAME, cardText, plural, seatName } from '../../../ui/text'
import { sortHand, teamName } from './text'

const LINE_LABEL: Record<ScoreLine['label'], string> = {
  cards: 'Cards won',
  lastTrick: 'Last trick',
  call: 'Call',
  jodhi: 'Jodhi',
  opponentJodhi: "Opponents' Jodhi",
}

/** A Thunee round is dealt in two halves, six cards each, and the review shows both. */
const HALVES: DealShown<Card> = { sort: sortHand, dealName: (half) => (half === 0 ? 'First half' : 'Second half') }

/** What a guilty play was caught doing, by the first rule it broke. */
const CAUGHT: Record<string, string> = { renege: 'not following suit', undercut: 'undercutting a trump' }

/** One sentence saying why the round ended as it did. */
export function headline(view: View, s: RoundSummary): string {
  const name = (seat: number) => seatName(view, seat)
  if (s.challenge) {
    const what = s.challenge.kind === 'play' ? (s.challenge.card ? `playing ${cardText(s.challenge.card)}` : 'a play') : `a Jodhi in ${SUIT_NAME[s.challenge.suit!]}`
    return s.challenge.guilty
      ? `${name(s.challenge.challenger)} caught ${name(s.challenge.accused)} ${s.challenge.kind === 'play' ? CAUGHT[s.challenge.rule ?? 'renege'] : 'calling a false Jodhi'}.`
      : `${name(s.challenge.challenger)} challenged ${name(s.challenge.accused)} over ${what}, and was wrong.`
  }
  if (s.thunee) {
    if (s.thunee.success) return `${name(s.thunee.caller)} made the Thunee.`
    return s.thunee.partnerCatch ? `${name(s.thunee.caller)}'s Thunee was caught by their own partner.` : `${name(s.thunee.caller)}'s Thunee was stopped.`
  }
  if (s.double) return s.double.success ? `${name(s.double.caller)} made the Double.` : `${name(s.double.caller)}'s Double failed.`
  if (s.khanaak) {
    const kind = s.khanaak.backward ? 'backward Khanaak' : 'Khanaak'
    return s.khanaak.success
      ? `${name(s.khanaak.caller)} made the ${kind}: Jodhi ${s.khanaak.jodhi} plus 10 against ${s.khanaak.opponentPoints}.`
      : `${name(s.khanaak.caller)}'s ${kind} failed.`
  }
  const n = s.normal!
  return n.total >= n.target
    ? `The counting side reached ${n.total}, needing ${n.target}.`
    : `The counting side made ${n.total}, short of ${n.target}.`
}

/** "You take", "Asha & Chan take", but "Asha takes" in a two-player game. */
function verbFor(view: View, team: Team, base: string): string {
  return view.playerCount === 2 && !(view.seat !== null && teamOf(view.seat) === team) ? `${base}s` : base
}

export function RoundResult({ view, summary, winner, can }: { view: View; summary: RoundSummary; winner: Team | null; can: Available }) {
  const { send } = useSession()
  // A drill ends with its round: its verdict says what next.
  const drilled = useCoach()?.state.drill != null
  if (winner !== null) return <GameOver view={view} summary={summary} winner={winner} can={can} />
  return (
    <section className="panel p-4 w-full max-w-sm grid gap-3">
      <h2 className="display text-xl">{`${teamName(view, summary.winner, view.seat)} ${verbFor(view, summary.winner, 'take')} ${plural(summary.balls, 'ball')}`}</h2>
      <p>{headline(view, summary)}</p>

      {summary.normal && (
        <table className="w-full">
          <caption className="text-left text-sm text-on-surface-muted pb-1">Counting side: {teamName(view, summary.normal.countingTeam)}</caption>
          <tbody>
            {summary.normal.lines
              .filter((line) => line.value !== 0 || line.label === 'cards')
              .map((line) => (
                <tr key={line.label}>
                  <td>{LINE_LABEL[line.label]}</td>
                  <td className="text-right tabular-nums">{line.value > 0 && line.label !== 'cards' ? `+${line.value}` : line.value}</td>
                </tr>
              ))}
            <tr className="border-t border-line font-semibold">
              <td>Total (needs {summary.normal.target})</td>
              <td className="text-right tabular-nums">{summary.normal.total}</td>
            </tr>
          </tbody>
        </table>
      )}

      <p className="text-on-surface-muted">
        Balls: {teamName(view, 0)} {summary.ballsAfter[0]}, {teamName(view, 1)} {summary.ballsAfter[1]}. First to {view.ballsTarget}.
      </p>

      <CoachReview view={view} shown={HALVES} />

      <TableNames view={view} />
      {drilled ? null : can.nextRound ? (
        <button className="btn btn-primary" onClick={() => {
            playSound('tap')
            send({ type: 'nextRound' })
          }}>
          Deal next round
        </button>
      ) : (
        <p className="text-on-surface-muted">Waiting for a player to deal the next round.</p>
      )}
    </section>
  )
}

/** The game's end: who won, the final balls side by side, how long it took, and the last round under it. */
function GameOver({ view, summary, winner, can }: { view: View; summary: RoundSummary; winner: Team; can: Available }) {
  const { send } = useSession()
  const mine = view.seat !== null && teamOf(view.seat) === winner
  const loser = (1 - winner) as Team
  const side = (team: Team) => (
    <div className="final-side" data-winner={team === winner} style={{ '--team': `var(--team${team})`, '--on-team': `var(--on-team${team})` } as React.CSSProperties}>
      <b>{summary.ballsAfter[team]}</b>
      <span>{teamName(view, team, view.seat)}</span>
    </div>
  )
  return (
    <section className="panel p-4 w-full max-w-sm grid gap-3">
      <div>
        <p className="eyebrow">Game over</p>
        <h2 className="display text-2xl">{mine ? 'You win' : `${teamName(view, winner)} ${verbFor(view, winner, 'win')}`}</h2>
      </div>
      <div className="final-score">
        {side(winner)}
        {side(loser)}
      </div>
      <p>
        {mine ? 'Well played: ' : ''}
        {`${plural(view.ballsTarget, 'ball')} in ${plural(summary.roundNumber, 'round')}.`}
      </p>
      <p className="text-on-surface-muted">Last round: {headline(view, summary)}</p>

      <CoachReview view={view} shown={HALVES} />

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
