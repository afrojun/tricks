import { type Available, type RoundSummary, type ScoreLine, type Team, type View, teamOf } from '../engine'
import { CoachReview } from './coach/CoachReview'
import { useSession } from './session'
import { SUIT_NAME, cardText, plural, seatName, teamName } from './text'

const LINE_LABEL: Record<ScoreLine['label'], string> = {
  cards: 'Cards won',
  lastTrick: 'Last trick',
  call: 'Call',
  jodhi: 'Jodhi',
  opponentJodhi: "Opponents' Jodhi",
}

/** One sentence saying why the round ended as it did. */
function headline(view: View, s: RoundSummary): string {
  const name = (seat: number) => seatName(view, seat)
  if (s.challenge) {
    const what = s.challenge.kind === 'play' ? (s.challenge.card ? `playing ${cardText(s.challenge.card)}` : 'a play') : `a Jodhi in ${SUIT_NAME[s.challenge.suit!]}`
    return s.challenge.guilty
      ? `${name(s.challenge.challenger)} caught ${name(s.challenge.accused)} ${s.challenge.kind === 'play' ? 'not following suit' : 'calling a false Jodhi'}.`
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

export function RoundResult({ view, summary, winner, can }: { view: View; summary: RoundSummary; winner: Team | null; can: Available }) {
  const { send } = useSession()
  const mine = view.seat !== null && teamOf(view.seat) === summary.winner
  // "You take", "Asha & Chan take", but "Asha takes" in a two-player game.
  const verb = (team: Team, base: string) =>
    view.playerCount === 2 && !(view.seat !== null && teamOf(view.seat) === team) ? `${base}s` : base
  return (
    <section className="panel p-4 w-full max-w-xs grid gap-3">
      <h2 className="display text-xl">
        {winner !== null
          ? `${teamName(view, winner, view.seat)} ${verb(winner, 'win')} the game`
          : `${teamName(view, summary.winner, view.seat)} ${verb(summary.winner, 'take')} ${plural(summary.balls, 'ball')}`}
      </h2>
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

      <CoachReview view={view} />

      {winner === null ? (
        can.nextRound ? (
          <button className="btn btn-primary" onClick={() => send({ type: 'nextRound' })}>
            Deal next round
          </button>
        ) : (
          <p className="text-on-surface-muted">Waiting for a player to deal the next round.</p>
        )
      ) : can.rematch ? (
        <button className="btn btn-primary" onClick={() => send({ type: 'rematch' })}>
          Play again
        </button>
      ) : (
        <p className="text-on-surface-muted">{mine ? 'Well played.' : 'Better luck next game.'} The host can start another.</p>
      )}
    </section>
  )
}
