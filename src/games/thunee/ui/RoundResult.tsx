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
    const c = s.challenge
    const what = c.kind === 'play' ? (c.card ? `playing ${cardText(c.card)}` : 'a play') : c.kind === 'thunee' ? 'their Thunee' : `a Jodhi in ${SUIT_NAME[c.suit!]}`
    const offence = c.kind === 'play' ? CAUGHT[c.rule ?? 'renege'] : c.kind === 'thunee' ? 'calling Thunee with six cards of one suit' : 'calling a false Jodhi'
    return c.guilty
      ? `${name(c.challenger)} caught ${name(c.accused)} ${offence}.`
      : `${name(c.challenger)} challenged ${name(c.accused)} over ${what}, and was wrong.`
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

/** A seat by name, or "You". */
function who(view: View, seat: number): string {
  return seat === view.seat ? 'You' : seatName(view, seat)
}

/** Why the round is worth the balls it is: one line, then a quieter one for the rule behind the number when it is not plain. */
export function ballsWhy(view: View, s: RoundSummary, partnerCatchBalls: number): { line: string; aside?: string } {
  const balls = plural(s.balls, 'ball')
  if (s.challenge) return { line: `${headline(view, s).replace(/\.$/, '')}: ${balls}`, aside: 'A challenge is always worth 4 balls, to whoever was right.' }
  if (s.thunee) {
    const caller = who(view, s.thunee.caller)
    // Under the team rule a partner may win the tricks too: the side wins or loses them.
    const by = view.rules.thuneeWinner === 'team' ? ` and ${caller === 'You' ? 'your' : 'their'} side` : ' and'
    if (s.thunee.success) return { line: `${caller} called Thunee${by} won every trick: ${balls}` }
    if (!s.thunee.partnerCatch) return { line: `${caller} called Thunee${by} lost a trick: ${balls}` }
    return {
      line: `${caller} called Thunee and their own partner took a trick: ${balls}`,
      aside: partnerCatchBalls === 4 ? undefined : `A Thunee lost to the caller's partner costs ${plural(partnerCatchBalls, 'ball')} instead of 4.`,
    }
  }
  if (s.double) {
    const caller = who(view, s.double.caller)
    return s.double.success
      ? { line: `${caller} called Double and won the last trick: ${balls}` }
      : { line: `${caller} called Double and lost the last trick: ${balls}`, aside: 'A Double is worth 2 balls if made, and costs 4 if not.' }
  }
  if (s.khanaak) {
    const caller = who(view, s.khanaak.caller)
    const kind = s.khanaak.backward ? 'a backward Khanaak' : 'Khanaak'
    return s.khanaak.success
      ? { line: `${caller} made ${kind}: ${balls}`, aside: s.khanaak.backward ? 'Called by the counting side, a Khanaak is worth 6 balls instead of 3.' : undefined }
      : { line: `${caller} called ${kind} and it failed: ${balls}`, aside: 'A Khanaak that fails costs 4 balls.' }
  }
  const n = s.normal!
  const reached = n.total >= n.target
  if (reached && s.callAmount > 0) {
    return { line: `${who(view, s.trumper)} called ${s.callAmount} and lost: ${balls}`, aside: '1 ball without a call. The call doubles it.' }
  }
  return reached
    ? { line: `${teamName(view, n.countingTeam, view.seat)} reached ${n.total}, needing ${n.target}: ${balls}` }
    : { line: `${teamName(view, (1 - n.countingTeam) as Team, view.seat)} held the counting side to ${n.total}, short of ${n.target}: ${balls}` }
}

/** The result fills the table: the panel scrolls if it must, and its button stays in reach below it. */
function ResultFrame({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="h-full w-full max-w-sm mx-auto flex flex-col">
      {/* Room for the panel's plate, which overhangs its right and bottom edges. */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-2 pb-3">{children}</div>
      <div className="shrink-0 pt-2">{footer}</div>
    </div>
  )
}

/** The winning side's balls, the new ones marked. */
function BallTrack({ view, summary }: { view: View; summary: RoundSummary }) {
  const after = summary.ballsAfter[summary.winner]
  const length = Math.max(view.ballsTarget, after)
  return (
    <span className="ball-track" aria-hidden>
      {Array.from({ length }, (_, i) => (
        <i key={i} data-on={i < after} data-new={i >= after - summary.balls && i < after} />
      ))}
    </span>
  )
}

function BallsLine({ view }: { view: View }) {
  return (
    <p className="text-on-surface-muted flex flex-wrap items-center gap-x-1.5 gap-y-1">
      Balls:
      {([0, 1] as Team[]).map((team) => (
        <span key={team} className="team-tag" data-team={team}>
          {teamName(view, team, view.seat)} {view.balls[team]}
        </span>
      ))}
      · first to {view.ballsTarget}
    </p>
  )
}

export function RoundResult({ view, summary, winner, can }: { view: View; summary: RoundSummary; winner: Team | null; can: Available }) {
  const { send } = useSession()
  // A drill ends with its round: its verdict says what next.
  const drilled = useCoach()?.state.drill != null
  if (winner !== null) return <GameOver view={view} summary={summary} winner={winner} can={can} />
  const why = ballsWhy(view, summary, view.rules.thuneePartnerCatchBalls)
  const n = summary.normal
  return (
    <ResultFrame
      footer={
        drilled ? null : can.nextRound ? (
          <button
            className="btn btn-primary w-full"
            onClick={() => {
              playSound('tap')
              send({ type: 'nextRound' })
            }}
          >
            Deal next round
          </button>
        ) : (
          <p className="text-center">Waiting for a player to deal the next round.</p>
        )
      }
    >
      <section className="panel p-4 grid gap-3">
        <div>
          <h2 className="display text-3xl">{`${teamName(view, summary.winner, view.seat)} ${verbFor(view, summary.winner, 'take')} ${plural(summary.balls, 'ball')}`}</h2>
          <BallTrack view={view} summary={summary} />
        </div>
        <div>
          <p className="font-bold">{why.line}</p>
          {why.aside && <p className="text-on-surface-muted">{why.aside}</p>}
        </div>

        {n && (
          <div className="receipt">
            <p className="text-on-surface-muted" data-head>
              Counted by {teamName(view, n.countingTeam, view.seat)}
            </p>
            {n.lines
              .filter((line) => line.value !== 0 || line.label === 'cards')
              .map((line) => (
                <p key={line.label}>
                  <span>{line.label !== 'call' ? LINE_LABEL[line.label] : summary.trumper === view.seat ? 'Your call' : `${seatName(view, summary.trumper)}'s call`}</span>
                  <b>{line.value > 0 && line.label !== 'cards' ? `+${line.value}` : line.value}</b>
                </p>
              ))}
            <p data-total>
              <span>
                Total <span className="text-on-surface-muted font-normal">needs {n.target}</span>
              </span>
              <b>{n.total}</b>
            </p>
          </div>
        )}

        <BallsLine view={view} />
        <CoachReview view={view} shown={HALVES} />
        <TableNames view={view} />
      </section>
    </ResultFrame>
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
    <ResultFrame
      footer={
        <Again
          view={view}
          again={view.phase.kind === 'gameOver' ? view.phase.again : []}
          canAgain={can.again}
          canStart={can.rematch}
          onAgain={() => send({ type: 'rematch' })}
          onStart={() => send({ type: 'rematch', now: true })}
        />
      }
    >
      <section className="panel p-4 grid gap-3">
        <div>
          <p className="eyebrow">Game over · first to {view.ballsTarget}</p>
          <h2 className="display text-2xl">{mine ? 'You win' : `${teamName(view, winner)} ${verbFor(view, winner, 'win')}`}</h2>
        </div>
        <div className="final-score">
          {side(winner)}
          {side(loser)}
        </div>
        <p>
          {mine ? 'Well played: ' : ''}
          {`${summary.ballsAfter[winner]} balls to ${summary.ballsAfter[loser]}, in ${plural(summary.roundNumber, 'round')}.`}
        </p>
        <p className="text-on-surface-muted">Last round: {headline(view, summary)}</p>
        <CoachReview view={view} shown={HALVES} />
      </section>
    </ResultFrame>
  )
}
