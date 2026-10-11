import { useEffect, useState } from 'react'
import {
  type Available,
  type Seat,
  type Suit,
  type Team,
  type TrumpChoice,
  type View,
  type ViewPhase,
  type ViewPlaying,
  availableActions,
  jodhiPoints,
  pauseWaitingOn,
  teamOf,
  TIMERS,
} from '../engine'
import { AccuseSheet } from '../../../ui/Accuse'
import { CallGrid } from '../../../ui/Call'
import { Pip, SuitChip } from '../../../ui/Card'
import { GameMenu } from '../../../ui/GameMenu'
import { Hand } from '../../../ui/Hand'
import { check } from '../coach/check'
import { TOPICS } from '../coach/topics'
import { CoachStrip } from '../../../ui/coach/CoachStrip'
import { HowToPlaySheet } from '../../../ui/coach/CoachSheets'
import { BALL_STAGGER_MS, CHALLENGE_BEAT_MS, VERDICT_BEAT_MS } from './present'
import { RoundResult } from './RoundResult'
import { RulesSheet, rulesSummary } from '../../../ui/Rules'
import { SeatBadge as Badge, TakeOver, usePosition } from '../../../ui/Seat'
import { Sheet } from '../../../ui/Sheet'
import { TalkMine } from '../../../ui/talk/Said'
import { TalkButton } from '../../../ui/talk/Tray'
import { Timer } from '../../../ui/Timer'
import { LastTrick, NO_TRICK, TrickArea, useGathering } from '../../../ui/Trick'
import { TOWARD, type Where } from '../../../ui/seats'
import { useGameClient } from '../../../ui/session'
import { playSound } from '../../../ui/sound'
import { SUIT_NAME, plural, seatName } from '../../../ui/text'
import { useCoach, useSession } from './session'
import { isRed as isRedSuit } from '../../../ui/text'
import { sortHand, teamName } from './text'

type SheetName = 'menu' | 'history' | 'rules' | 'jodhi' | 'challenge' | 'howto' | null

/** New balls to fill one at a time on the score track. */
export interface BallBurst {
  team: Team
  from: number
  count: number
  id: number
}

/** The balls a round has just won, filled in one at a time with a pip each; after the verdict when a challenge ended the round. */
function useBallBurst(): BallBurst | null {
  const { store } = useSession()
  const [burst, setBurst] = useState<BallBurst | null>(null)
  useEffect(() => {
    // Delayed steps, all cancelled if the table goes away.
    const timers: ReturnType<typeof setTimeout>[] = []
    const later = (run: () => void, ms: number) => {
      if (ms <= 0) return run()
      timers.push(setTimeout(run, ms))
    }
    const stop = store.onEvent((event) => {
      if (event.type === 'roundScored') {
        const { winner, balls, ballsAfter, challenge } = event.summary
        // After a challenge, the balls wait for the verdict.
        const wait = challenge ? CHALLENGE_BEAT_MS + VERDICT_BEAT_MS / 2 : 0
        later(() => setBurst({ team: winner, from: ballsAfter[winner] - balls, count: balls, id: event.n }), wait)
        for (let i = 0; i < balls; i++) later(() => playSound('ball'), wait + i * BALL_STAGGER_MS)
      }
      if (event.type === 'dealt') setBurst(null)
    })
    return () => {
      stop()
      timers.forEach(clearTimeout)
    }
  }, [store])
  return burst
}

export function Table({ view, room }: { view: View; room: string }) {
  const { send } = useSession()
  const game = useGameClient()
  const burst = useBallBurst()
  const position = usePosition(view)
  const [sheet, setSheet] = useState<SheetName>(null)
  const me = view.seat ?? 0
  const watching = view.seat === null
  const phase = view.phase
  const can = availableActions(view)
  const myTurn = phase.kind === 'playing' && phase.turn === view.seat
  const coached = useCoach()
  const advised = coached?.state.showHint ? coached.state.advice?.action : undefined
  const coach = coached?.coach
  // In practice the table waits while the player reads any sheet.
  useEffect(() => {
    coach?.setReading('table', sheet !== null)
  }, [coach, sheet])

  useEffect(() => {
    if (!myTurn) return
    playSound('turn')
  }, [myTurn])

  const others = view.seats.map((_, seat) => seat).filter((seat) => seat !== me)
  const at = (where: Where) => others.find((seat) => position(seat) === where)
  const hand = 'hand' in phase ? sortHand(phase.hand) : []
  const playing = phase.kind === 'playing' || phase.kind === 'trickPause' ? phase : null
  const ended = phase.kind === 'roundResult' || phase.kind === 'gameOver'
  // The round's result takes the table once its last trick has been gathered in.
  const gathering = useGathering(ended, phase.kind === 'trickPause')
  const over = ended && !gathering
  const crowded = playing !== null && actionCount(can, playing, view.rules.allowCheating) >= 3

  return (
    <div className="h-[calc(100dvh-var(--update-h,0px))] flex flex-col overflow-hidden" data-felt-table>
      <StatusStrip view={view} burst={burst} onMenu={() => setSheet('menu')} onTricks={() => setSheet('history')} />
      <RoundFacts view={view} />

      {over ? (
        // The result takes the table: its panel scrolls if it must, with its button below; the seats have no cards to show.
        <div className="flex-1 min-h-0 px-3 py-2">
          <Centre view={view} can={can} />
        </div>
      ) : (
        // During play nothing may clip a travelling card.
        <div className="flex-1 min-h-0 grid grid-rows-[auto_1fr] grid-cols-[minmax(0,1fr)] gap-1 px-2">
          <div className="flex justify-center">{at('top') !== undefined && <SeatBadge view={view} seat={at('top')!} />}</div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[minmax(0,1fr)] items-center gap-1 min-h-0">
            <div className="self-stretch min-h-0">{at('left') !== undefined && <SeatBadge view={view} seat={at('left')!} side="left" />}</div>
            {/*
              The trick keeps one place all round, empty under the calling and Thunee panels, so the rays
              behind it never move. A panel drops its notes when the middle is short (.centre-box), and
              one still taller than the table scrolls, from its top.
            */}
            <div className="trick-stage relative h-full min-h-0 flex items-center justify-center py-1">
              <TrickArea view={view} phase={playing ?? NO_TRICK} />
              {!playing && !gathering && (
                <div className="centre-box absolute inset-0 flex justify-center items-center-safe overflow-y-auto py-1">
                  <Centre view={view} can={can} />
                </div>
              )}
            </div>
            <div className="self-stretch min-h-0">{at('right') !== undefined && <SeatBadge view={view} seat={at('right')!} side="right" />}</div>
          </div>
        </div>
      )}

      <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
        {coached && <CoachStrip lessons={TOPICS} over={over} />}
        {/*
          The player's line, one row: what to do, and the buttons that act now, with the talk button at its
          right end. Its height is kept, so the hand does not move when a button comes or goes; three buttons
          say what to do, and the cue gives way.
        */}
        <div className="hint-row player-line" aria-live="polite">
          {!coached && !crowded && <span className="player-cue">{watching ? 'You’re watching' : <Hint view={view} can={can} />}</span>}
          {!watching && !over && <ActionButtons can={can} playing={playing} accuse={view.rules.allowCheating} onSheet={setSheet} />}
          <TalkButton />
        </div>
        {/* How to play a card, said once: on the player's first turn of the game. */}
        {!coached && myTurn && view.roundNumber === 1 && phase.tricks.length === 0 && (
          <p className="px-3 text-sm text-muted">Tap a card or drag it onto the table.</p>
        )}
        {can.reclaimSeat && <TakeOver />}
        {watching && (
          <div className="flex justify-center pb-3">
            <SeatBadge view={view} seat={0} />
          </div>
        )}
        {/* A round's result has the room: the hand, empty by then, keeps a card's height in play. */}
        {!watching && !over && (
          <div className="relative">
            {/* The player's roles and what they have said, on the corner of their hand, which is where a throw at them lands. */}
            <div className="hand-tags" data-seat-name={me}>
              <RoleBadges view={view} seat={me} />
              {said(view, me).map((text) => (
                <span key={text} className="bubble" data-mine>
                  {text}
                </span>
              ))}
              <TalkMine />
            </div>
            <Hand
              cards={hand}
              playable={myTurn}
              legal={can.legal}
              anyway={view.rules.allowCheating}
              dealFrom={TOWARD[position(view.dealer)]}
              onPlay={(card) => send({ type: 'playCard', card })}
              suggested={advised?.type === 'playCard' ? advised.card : null}
              explain={coached ? (card) => check(view, { type: 'playCard', card })?.body ?? null : undefined}
            />
          </div>
        )}
      </div>

      {sheet === 'menu' && (
        <Sheet title="Menu" onClose={() => setSheet(null)}>
          <MenuSheet view={view} room={room} onSheet={setSheet} />
        </Sheet>
      )}
      {sheet === 'rules' && <RulesSheet game={game} rules={view.rules} onClose={() => setSheet(null)} />}
      {sheet === 'howto' && <HowToPlaySheet lessons={TOPICS} onClose={() => setSheet(null)} />}
      {sheet === 'history' && (
        <Sheet title="Last trick" onClose={() => setSheet(null)}>
          <LastTrick view={view} playing={playing} />
        </Sheet>
      )}
      {sheet === 'jodhi' && playing && (
        <Sheet title="Call Jodhi" onClose={() => setSheet(null)}>
          <JodhiSheet can={can} trump={playing.trump} challenged={view.rules.allowCheating} onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === 'challenge' && playing && <ChallengeSheet view={view} can={can} playing={playing} onClose={() => setSheet(null)} />}
    </div>
  )
}

// ── Status strip ─────────────────────────────────────────────────────────

function StatusStrip({ view, burst, onMenu, onTricks }: { view: View; burst: BallBurst | null; onMenu: () => void; onTricks: () => void }) {
  const phase = view.phase
  const playing = phase.kind === 'playing' || phase.kind === 'trickPause' ? phase : null
  const myTeam = view.seat === null ? null : teamOf(view.seat)

  return (
    <header className="shrink-0 grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1">
      {([0, 1] as const).map((team) => {
        // Shown from the deal, at 0 until a trick is won, so nothing new appears at the top when play starts.
        const dealt = phase.kind === 'calling' || phase.kind === 'trumpSelection' || phase.kind === 'thuneeWindow'
        const tricks = playing ? playing.tricks.filter((t) => teamOf(t.winner) === team).length : dealt ? 0 : null
        return (
          // Both tickets fill their column, so the two teams' labels are the same size.
          <div key={team} className={`min-w-0 grid gap-1 ${team === 1 ? 'order-3' : ''}`}>
            <div className="ticket max-w-full" data-team={team} style={{ '--team': `var(--team${team})`, '--on-team': `var(--on-team${team})` } as React.CSSProperties}>
              <b className="ticket-num" aria-label={`${view.balls[team]} of ${view.ballsTarget} balls`}>
                {view.balls[team]}
              </b>
              <span className="ticket-who">
                <span className="ticket-name">{teamName(view, team, myTeam === team ? view.seat : null)}</span>
                <span className="pip-track" aria-hidden>
                  {Array.from({ length: view.ballsTarget }, (_, i) => {
                    const fresh = burst !== null && burst.team === team && i >= burst.from && i < burst.from + burst.count
                    return (
                      <i
                        key={fresh ? `${burst.id}-${i}` : i}
                        data-on={i < view.balls[team]}
                        data-fresh={fresh}
                        style={fresh ? { animationDelay: `${(i - burst.from) * BALL_STAGGER_MS}ms` } : undefined}
                      />
                    )
                  })}
                </span>
              </span>
            </div>
            {tricks !== null ? (
              <button key={tricks} className={`trick-pile ${team === 1 ? 'justify-self-end' : ''}`} data-won={tricks > 0} onClick={onTricks} aria-label={`${plural(tricks, 'trick')} won. Show the last trick.`}>
                <span aria-hidden className="trick-pile-icon" />
                {plural(tricks, 'trick')}
              </button>
            ) : (
              // Its room is kept outside play, so the table does not move down when the first trick starts.
              <span aria-hidden className="trick-pile invisible">
                <span className="trick-pile-icon" />0 tricks
              </span>
            )}
          </div>
        )
      })}
      <button className="order-2 btn btn-small" onClick={onMenu} aria-label="Open menu">
        Menu
      </button>
    </header>
  )
}


/** Trump, the call and the target for this round, in one line. */
function RoundFacts({ view }: { view: View }) {
  const phase = view.phase
  const playing = phase.kind === 'playing' || phase.kind === 'trickPause' ? phase : null
  /** Each fact, and whether it is the one that matters most: trump, once it is known. */
  const facts: { text: React.ReactNode; on?: boolean }[] = []
  const say = (text: React.ReactNode) => facts.push({ text })
  const trump = (suit: Suit) => facts.push({ text: <Trump suit={suit} />, on: true })

  if (playing?.thunee) {
    const caller = playing.thunee.caller
    // Under "Either partner" the caller's side must win every trick, not the caller alone.
    const who = view.rules.thuneeWinner === 'team' && view.playerCount === 4 ? (view.seat !== null && teamOf(caller) === teamOf(view.seat) ? 'your side' : `${seatName(view, caller)}’s side`) : caller === view.seat ? 'you' : seatName(view, caller)
    say(`Thunee: ${who} must win every trick`)
    if (playing.trump) trump(playing.trump)
  } else if (playing) {
    if (playing.trump) trump(playing.trump)
    // Short enough that the round's facts keep to one line on a phone.
    else say('Trump hidden')
    if (playing.callAmount > 0) say(`Call ${playing.callAmount}`)
    const counting = (1 - teamOf(playing.trumper)) as Team
    const target = view.playerCount === 2 ? view.rules.twoPlayerTarget : 105
    // The teams' names are on the score tickets; a spectator, who is on neither side, gets the name here.
    const who = view.seat === null ? `${teamName(view, counting)} count` : teamOf(view.seat) === counting ? 'You count' : 'They count'
    say(`${who} to ${target}`)
  } else if (phase.kind === 'thuneeWindow') {
    if (phase.trump) trump(phase.trump)
    else say('Trump hidden')
    if (phase.callAmount > 0) say(`Call ${phase.callAmount}`)
  } else if (phase.kind === 'calling' || phase.kind === 'trumpSelection') {
    say(`Round ${view.roundNumber}`)
    say('No trump yet')
  }
  if (facts.length === 0) return null
  return (
    <ul className="shrink-0 flex flex-wrap justify-center gap-x-1.5 gap-y-1 px-3 pt-1 pb-1">
      {facts.map((fact, i) => (
        <li key={i} className="fact" data-on={fact.on ?? false}>
          {fact.text}
        </li>
      ))}
    </ul>
  )
}

function Trump({ suit }: { suit: Suit }) {
  return (
    <>
      Trump
      <SuitChip suit={suit} />
    </>
  )
}

/** Small markers for the dealer and the player who chose trump. */
function RoleBadges({ view, seat }: { view: View; seat: Seat }) {
  const phase = view.phase
  const trumper = 'trumper' in phase ? phase.trumper : null
  if (phase.kind === 'roundResult' || phase.kind === 'gameOver' || phase.kind === 'lobby') return null
  return (
    <>
      {view.dealer === seat && <span className="role-badge">Dealer</span>}
      {trumper === seat && <span className="role-badge">Trumper</span>}
    </>
  )
}

/**
 * What this player has said out loud so far, as anyone at the table would have heard:
 * their call or pass, and any Thunee, Jodhi, Double or Khanaak.
 */
function said(view: View, seat: Seat): string[] {
  const phase = view.phase
  switch (phase.kind) {
    case 'calling':
      if (phase.call?.seat === seat) return [`Call ${phase.call.amount}!`]
      return phase.passed.includes(seat) ? ['Pass'] : []
    case 'thuneeWindow':
      if (phase.pending === seat) return ['Thunee!']
      return phase.passed.includes(seat) ? ['No Thunee'] : []
    case 'playing':
    case 'trickPause':
      return [
        ...(phase.thunee?.caller === seat ? ['Thunee!'] : []),
        ...(phase.double?.caller === seat ? ['Double!'] : []),
        ...(phase.khanaak?.caller === seat ? ['Khanaak!'] : []),
        ...phase.jodhiClaims.filter((j) => j.seat === seat).map((j) => `Jodhi ${j.points}!`),
      ]
    default:
      return []
  }
}

/** Another player, with their role badges and what they have said. */
function SeatBadge({ view, seat, side }: { view: View; seat: Seat; side?: 'left' | 'right' }) {
  const phase = view.phase
  const count = 'handCounts' in phase ? phase.handCounts[seat] : 0
  const playing = phase.kind === 'playing' && phase.turn === seat
  const turn = playing || (phase.kind === 'trumpSelection' && phase.trumper === seat)
  return (
    <Badge view={view} seat={seat} side={side} turn={turn} choosing={playing} count={count} tags={<RoleBadges view={view} seat={seat} />} said={said(view, seat)} />
  )
}

// ── Centre of the table ──────────────────────────────────────────────────

function Centre({ view, can }: { view: View; can: Available }) {
  const phase = view.phase
  switch (phase.kind) {
    case 'calling':
      return <CallingPanel view={view} phase={phase} can={can} />
    case 'trumpSelection':
      return <TrumpPanel view={view} phase={phase} can={can} />
    case 'thuneeWindow':
      return <ThuneePanel view={view} phase={phase} can={can} />
    case 'playing':
    case 'trickPause':
      return null
    case 'roundResult':
    case 'gameOver':
      return <RoundResult view={view} summary={phase.summary} winner={phase.kind === 'gameOver' ? phase.winner : null} can={can} />
    case 'lobby':
      return null
  }
}

function TrumpButtons({ choices, chosen, onChoose }: { choices: TrumpChoice[]; chosen?: TrumpChoice | null; onChoose: (c: TrumpChoice) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {choices.map((choice) => (
        <button key={choice} className="btn !px-3" aria-pressed={chosen === choice} onClick={() => onChoose(choice)}>
          {choice === 'lastCard' ? (
            'Last card'
          ) : (
            <Pip suit={choice} label={SUIT_NAME[choice]} className={`w-7 h-7 ${isRedSuit(choice) ? 'text-danger' : ''}`} />
          )}
        </button>
      ))}
    </div>
  )
}

/** Sends an action that commits the player, with the soft sound a committing button makes. */
function useCommit() {
  const { send } = useSession()
  return (action: Parameters<typeof send>[0]) => {
    playSound('tap')
    send(action)
  }
}

/**
 * What a call costs and what Last card means. Online they are the hint under the table, which keeps
 * two lines' room and is otherwise empty while calling and choosing trump, so a short screen never
 * loses them. In practice that line is the coach's, and they stay in the panel.
 */
const CALL_NOTE = 'Call to choose trump. The other side starts that many points up.'
const LAST_CARD_NOTE = 'Last card makes trump the suit of the final card you are dealt.'

function CallingPanel({ view, phase, can }: { view: View; phase: Extract<ViewPhase, { kind: 'calling' }>; can: Available }) {
  const coached = useCoach()
  const { send } = useSession()
  const commit = useCommit()
  const trumper = phase.call?.seat ?? phase.defaultTrumper
  const mine = trumper === view.seat
  return (
    <section className="panel p-3 w-full max-w-sm grid gap-3">
      {phase.deadline !== null && <Timer deadline={phase.deadline} totalSeconds={view.settings.timers?.call ?? TIMERS.call.default} />}
      <p className="text-center">
        {phase.call
          ? `${mine ? 'You called' : `${seatName(view, phase.call.seat)} called`} ${phase.call.amount}.`
          : `${mine ? 'You choose' : `${seatName(view, trumper)} chooses`} trump unless someone calls.`}
      </p>
      {can.preselect.length > 0 && (
        <div className="grid gap-2">
          <p className="panel-note text-center text-sm text-on-surface-muted">Pick trump now. It stands unless someone calls higher.</p>
          <TrumpButtons choices={can.preselect} chosen={phase.preselect} onChoose={(choice) => send({ type: 'preselectTrump', choice })} />
        </div>
      )}
      {can.calls.length > 0 && (
        <div className="grid gap-2">
          {coached && <p className="panel-note text-center text-sm text-on-surface-muted">{CALL_NOTE}</p>}
          <CallGrid
            spelled
            numbers={can.calls}
            onCall={(amount) => commit({ type: 'call', amount })}
            label={(amount) => `Call ${amount}`}
            inline={[{ label: 'Pass', onClick: () => commit({ type: 'pass' }) }]}
          />
        </div>
      )}
      {view.seat !== null && phase.passed.includes(view.seat) && <p className="text-center text-on-surface-muted">You passed.</p>}
    </section>
  )
}

function TrumpPanel({ view, phase, can }: { view: View; phase: Extract<ViewPhase, { kind: 'trumpSelection' }>; can: Available }) {
  const coached = useCoach()
  const commit = useCommit()
  return (
    <section className="panel p-3 w-full max-w-sm grid gap-3">
      {can.chooseTrump.length > 0 ? (
        <>
          <p className="text-center">Choose trump{phase.callAmount > 0 ? ` for your call of ${phase.callAmount}` : ''}.</p>
          <TrumpButtons choices={can.chooseTrump} onChoose={(choice) => commit({ type: 'chooseTrump', choice })} />
          {coached && <p className="panel-note text-center text-sm text-on-surface-muted">{LAST_CARD_NOTE}</p>}
        </>
      ) : (
        <p className="text-center">{seatName(view, phase.trumper)} is choosing trump.</p>
      )}
    </section>
  )
}

function ThuneePanel({ view, phase, can }: { view: View; phase: Extract<ViewPhase, { kind: 'thuneeWindow' }>; can: Available }) {
  const commit = useCommit()
  return (
    <section className="panel p-3 w-full max-w-sm grid gap-3">
      {phase.deadline !== null && <Timer deadline={phase.deadline} totalSeconds={view.settings.timers?.thunee ?? TIMERS.thunee.default} />}
      <p className="text-center">
        {phase.pending !== null
          ? `${phase.pending === view.seat ? 'You want' : `${seatName(view, phase.pending)} wants`} Thunee. The trumping side can take it instead.`
          : view.rules.thuneeCaller === 'trumperOnly'
            ? `Only ${phase.trumper === view.seat ? 'you' : seatName(view, phase.trumper)} may call Thunee. Win all six tricks for 4 balls.`
            : 'Anyone for Thunee? Win all six tricks for 4 balls.'}
      </p>
      {(can.callThunee || can.pass) && (
        // The middle of the table never widens for a panel, so its buttons wrap when a narrow screen needs it.
        <div className="flex flex-wrap gap-2">
          {can.callThunee && (
            <button className="btn btn-danger flex-1" onClick={() => commit({ type: 'callThunee' })} aria-label="Call Thunee">
              Thunee
            </button>
          )}
          <button className="btn flex-1" onClick={() => commit({ type: 'pass' })}>
            No Thunee
          </button>
        </div>
      )}
    </section>
  )
}

// ── Hint line and actions ────────────────────────────────────────────────

/** What to do now, in a phrase: the cue for the player's own turn, a few words otherwise. */
function Hint({ view, can }: { view: View; can: Available }) {
  const phase = view.phase
  if (phase.kind === 'playing') {
    if (phase.turn === view.seat) return <b className="cue">{phase.current.length === 0 ? 'Your lead' : 'Your turn'}</b>
    return <>{seatName(view, phase.turn!)} to play</>
  }
  if (phase.kind === 'trickPause' && phase.redeal) {
    if (can.pass) return <b className="cue">They hold no trump</b>
    // Only a Thunee deals again mid-round: its caller's opponents have shown no trump.
    const caller = phase.thunee?.caller
    const theirs = view.seat !== null && caller !== undefined && teamOf(caller) !== teamOf(view.seat)
    return <>{theirs ? 'Dealing again: your side holds no trump' : 'Dealing again: they hold no trump'}</>
  }
  if (phase.kind === 'trickPause' && can.pass) return <b className="cue">{view.playerCount === 2 ? 'You won the trick: Jodhi?' : 'Your side won the trick: Jodhi?'}</b>
  if (phase.kind === 'trickPause' && can.claimJodhi.length > 0) return <b className="cue">You can call Jodhi</b>
  const jodhiFrom = phase.kind === 'trickPause' ? pauseWaitingOn(phase, view.playerCount) : []
  if (jodhiFrom.length > 0) return <>Waiting for {seatName(view, jodhiFrom[0])}</>
  if (phase.kind === 'calling' && can.calls.length > 0) return <>{CALL_NOTE}</>
  if (phase.kind === 'trumpSelection' && can.chooseTrump.length > 0) return <>{LAST_CARD_NOTE}</>
  if (phase.kind === 'roundResult') return <>Round {view.roundNumber} is over</>
  return null
}

const canChallenge = (can: Available, accuse: boolean) => accuse && (can.challengePlay.length > 0 || can.challengeJodhi.length > 0 || can.challengeThunee)

/** How many buttons the player's line shows now. */
function actionCount(can: Available, playing: ViewPlaying, accuse: boolean): number {
  const answer = playing.kind === 'trickPause' && can.pass
  return [can.claimJodhi.length > 0, answer, can.callDouble, can.callKhanaak, canChallenge(can, accuse)].filter(Boolean).length
}

/** The buttons that act now, beside the cue; each appears only while it does something. Without cheating there is no Challenge. */
function ActionButtons({ can, playing, accuse, onSheet }: { can: Available; playing: ViewPlaying | null; accuse: boolean; onSheet: (s: SheetName) => void }) {
  const { send } = useSession()
  if (!playing) return null
  const answer = playing.kind === 'trickPause' && can.pass
  // Three or more close up, leaving the talk button its room.
  const size = actionCount(can, playing, accuse) >= 3 ? 'btn-small !px-2' : 'btn-small'
  return (
    <span className="ml-auto flex shrink-0 gap-2">
      {can.claimJodhi.length > 0 && (
        <button className={`btn btn-primary attention ${size}`} onClick={() => onSheet('jodhi')} aria-label="Call Jodhi">
          Jodhi
        </button>
      )}
      {answer && (
        <button className={`btn ${size}`} onClick={() => send({ type: 'pass' })}>
          {playing.redeal ? 'Deal again' : 'No Jodhi'}
        </button>
      )}
      {can.callDouble && (
        <button className={`btn btn-primary attention ${size}`} onClick={() => send({ type: 'callDouble' })} aria-label="Call Double">
          Double
        </button>
      )}
      {can.callKhanaak && (
        <button className={`btn btn-primary attention ${size}`} onClick={() => send({ type: 'callKhanaak' })} aria-label="Call Khanaak">
          Khanaak
        </button>
      )}
      {canChallenge(can, accuse) && (
        <button className={`btn btn-quiet ${size}`} onClick={() => onSheet('challenge')}>
          Challenge
        </button>
      )}
    </span>
  )
}

// ── Sheets ───────────────────────────────────────────────────────────────

function JodhiSheet({ can, trump, challenged, onDone }: { can: Available; trump: Suit | null; challenged: boolean; onDone: () => void }) {
  const { send } = useSession()
  const claim = (suit: Suit, withJack: boolean) => {
    send({ type: 'claimJodhi', suit, withJack })
    onDone()
  }
  return (
    <div className="grid gap-3">
      <p>Which suit are your king and queen in?{challenged && ' Opponents can challenge a false call for 4 balls.'}</p>
      {can.claimJodhi.map((suit) => (
        <div key={suit} className="flex items-center gap-2">
          <Pip suit={suit} label={SUIT_NAME[suit]} className={`w-7 h-7 shrink-0 ${isRedSuit(suit) ? 'text-danger' : ''}`} />
          <button className="btn btn-small flex-1" onClick={() => claim(suit, false)}>
            King and queen, {jodhiPoints(suit, false, trump)}
          </button>
          <button className="btn btn-small flex-1" onClick={() => claim(suit, true)}>
            With the jack, {jodhiPoints(suit, true, trump)}
          </button>
        </div>
      ))}
    </div>
  )
}

function ChallengeSheet({ view, can, playing, onClose }: { view: View; can: Available; playing: ViewPlaying; onClose: () => void }) {
  const { send } = useSession()
  return (
    <AccuseSheet
      title="Challenge for 4 balls"
      risk="If they broke the rules your side takes 4 balls. If they did not, their side does. Either way the round ends."
      accusations={[
        ...can.challengePlay.map((seat) => ({
          key: `play-${seat}`,
          label: `${seatName(view, seat)} broke a rule`,
          send: () => send({ type: 'challengePlay', seat }),
        })),
        ...(can.challengeThunee && playing.thunee
          ? [
              {
                key: 'thunee',
                label: `${seatName(view, playing.thunee.caller)} called Thunee holding six cards of one suit`,
                send: () => send({ type: 'challengeThunee' }),
              },
            ]
          : []),
        ...can.challengeJodhi.map((index) => {
          const claim = playing.jodhiClaims[index]
          return {
            key: `jodhi-${index}`,
            label: `${seatName(view, claim.seat)}’s Jodhi ${claim.points} is false`,
            send: () => send({ type: 'challengeJodhi', claim: index }),
          }
        }),
      ]}
      onClose={onClose}
    />
  )
}

function MenuSheet({ view, room, onSheet }: { view: View; room: string; onSheet: (s: SheetName) => void }) {
  const coached = useCoach()
  const game = useGameClient()
  return (
    <GameMenu
      view={view}
      summary={`${coached ? 'Practice game' : `Game ${room}`}, round ${view.roundNumber} · ${rulesSummary(game, view.rules)}`}
      rows={[
        { label: 'Rules in this game', onClick: () => onSheet('rules') },
        { label: 'Last trick', onClick: () => onSheet('history') },
        ...(coached
          ? [
              { label: 'How to play', onClick: () => onSheet('howto') },
              {
                label: 'New practice game',
                onClick: () => {
                  coached.coach.restart(view.playerCount)
                  onSheet(null)
                },
              },
            ]
          : []),
      ]}
    />
  )
}
