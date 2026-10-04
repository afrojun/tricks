import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
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
  replaceableSeats,
  teamOf,
} from '../engine'
import { CardBack, PlayingCard } from './Card'
import { Hand, cardLayoutId } from './Hand'
import { RoundResult } from './RoundResult'
import { RulesList, rulesSummary } from './Rules'
import { Sheet } from './Sheet'
import { ThemePicker } from './ThemePicker'
import { personaLabel } from './personas'
import { navigate, useCountdown, useSession } from './session'
import { isMuted, playSound, setMuted } from './sound'
import { SUIT_NAME, SUIT_SYMBOL, isRed, plural, seatName, sortHand, teamName } from './text'

type SheetName = 'menu' | 'history' | 'rules' | 'jodhi' | 'challenge' | null
type Where = 'bottom' | 'right' | 'top' | 'left'

/** Where a seat sits on screen relative to the viewer, who is always at the bottom. */
function position(seat: Seat, me: Seat, n: number): Where {
  const offset = (seat - me + n) % n
  if (n === 2) return offset === 0 ? 'bottom' : 'top'
  return (['bottom', 'right', 'top', 'left'] as const)[offset]
}

/** Roughly how far, in pixels, a card travels to or from each side of the table. */
const TOWARD: Record<Where, { x: number; y: number }> = {
  bottom: { x: 0, y: 190 },
  top: { x: 0, y: -190 },
  left: { x: -150, y: 0 },
  right: { x: 150, y: 0 },
}

/** New balls to fill one at a time on the score track. */
export interface BallBurst {
  team: Team
  from: number
  count: number
  id: number
}

export function Table({ view, room, burst }: { view: View; room: string; burst: BallBurst | null }) {
  const { send, store } = useSession()
  const [sheet, setSheet] = useState<SheetName>(null)
  const me = view.seat ?? 0
  const watching = view.seat === null
  const phase = view.phase
  const can = availableActions(view)
  const myTurn = phase.kind === 'playing' && phase.turn === view.seat

  useEffect(() => {
    if (!myTurn) return
    playSound('yourTurn')
    navigator.vibrate?.(30)
  }, [myTurn])

  const others = view.seats.map((_, seat) => seat).filter((seat) => seat !== me)
  const at = (where: Where) => others.find((seat) => position(seat, me, view.playerCount) === where)
  const hand = 'hand' in phase ? sortHand(phase.hand) : []
  const playing = phase.kind === 'playing' || phase.kind === 'trickPause' ? phase : null
  // Result panels may need to scroll; during play nothing may clip a travelling card.
  const centreScrolls = phase.kind === 'roundResult' || phase.kind === 'gameOver'

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <StatusStrip view={view} burst={burst} onMenu={() => setSheet('menu')} onTricks={() => setSheet('history')} />
      <RoundFacts view={view} />

      <div className="flex-1 min-h-0 grid grid-rows-[auto_1fr] gap-1 px-2">
        <div className="flex justify-center">{at('top') !== undefined && <SeatBadge view={view} seat={at('top')!} />}</div>
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-1 min-h-0">
          <div>{at('left') !== undefined && <SeatBadge view={view} seat={at('left')!} side="left" />}</div>
          <div className={`h-full min-h-0 flex items-center justify-center py-1 ${centreScrolls ? 'overflow-y-auto' : ''}`}>
            <Centre view={view} can={can} />
          </div>
          <div>{at('right') !== undefined && <SeatBadge view={view} seat={at('right')!} side="right" />}</div>
        </div>
      </div>

      <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-center gap-2 px-3 min-h-7" aria-live="polite">
          {!watching && <RoleBadges view={view} seat={me} />}
          {!watching &&
            said(view, me).map((text) => (
              <span key={text} className="bubble" data-mine>
                {text}
              </span>
            ))}
          <span className="text-center">{watching ? 'You are watching this game.' : <Hint view={view} can={can} />}</span>
        </div>
        {can.reclaimSeat && (
          <div className="flex items-center justify-center gap-2 px-3 pb-1" role="status">
            <span>The computer is playing for you.</span>
            <button className="btn btn-primary btn-small" onClick={() => send({ type: 'reclaimSeat' })}>
              Take over
            </button>
          </div>
        )}
        {watching && (
          <div className="flex justify-center pb-3">
            <SeatBadge view={view} seat={0} />
          </div>
        )}
        {!watching && (
          <>
            <Hand
              cards={hand}
              playable={myTurn}
              legal={can.legal}
              dealFrom={TOWARD[position(view.dealer, me, view.playerCount)]}
              onPlay={(card) => send({ type: 'playCard', card })}
            />
            <ActionBar can={can} playing={playing} onSheet={setSheet} />
          </>
        )}
      </div>

      {sheet === 'menu' && (
        <Sheet title="Menu" onClose={() => setSheet(null)}>
          <MenuSheet view={view} room={room} onSheet={setSheet} now={store.serverNow(Date.now())} />
        </Sheet>
      )}
      {sheet === 'rules' && (
        <Sheet title="Rules in this game" onClose={() => setSheet(null)}>
          <p className="mb-3">{rulesSummary(view.rules)}</p>
          <RulesList rules={view.rules} />
        </Sheet>
      )}
      {sheet === 'history' && (
        <Sheet title="Last trick" onClose={() => setSheet(null)}>
          <LastTrick view={view} playing={playing} />
        </Sheet>
      )}
      {sheet === 'jodhi' && playing && (
        <Sheet title="Call Jodhi" onClose={() => setSheet(null)}>
          <JodhiSheet can={can} trump={playing.trump} onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet === 'challenge' && playing && (
        <Sheet title="Challenge for 4 balls" onClose={() => setSheet(null)}>
          <ChallengeSheet view={view} can={can} playing={playing} onDone={() => setSheet(null)} />
        </Sheet>
      )}
    </div>
  )
}

// ── Status strip ─────────────────────────────────────────────────────────

function StatusStrip({ view, burst, onMenu, onTricks }: { view: View; burst: BallBurst | null; onMenu: () => void; onTricks: () => void }) {
  const phase = view.phase
  const playing = phase.kind === 'playing' || phase.kind === 'trickPause' ? phase : null
  const myTeam = view.seat === null ? null : teamOf(view.seat)

  return (
    <header className="shrink-0 grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1">
      {([0, 1] as const).map((team) => {
        const tricks = playing ? playing.tricks.filter((t) => teamOf(t.winner) === team).length : null
        return (
          <div key={team} className={`min-w-0 grid gap-1 ${team === 1 ? 'order-3 justify-items-end text-right' : ''}`} style={{ color: team === 0 ? 'var(--team0)' : 'var(--team1)' }}>
            <p className="truncate max-w-full text-sm">{teamName(view, team, myTeam === team ? view.seat : null)}</p>
            <div className={`pip-track ${team === 1 ? 'justify-end' : ''}`} aria-label={`${view.balls[team]} of ${view.ballsTarget} balls`}>
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
            </div>
            {tricks !== null && (
              <button key={tricks} className="trick-pile" onClick={onTricks} aria-label={`${plural(tricks, 'trick')} won. Show the last trick.`}>
                <span aria-hidden className="trick-pile-icon" />
                {plural(tricks, 'trick')}
              </button>
            )}
          </div>
        )
      })}
      <button className="order-2 btn btn-quiet btn-small" onClick={onMenu} aria-label="Open menu">
        Menu
      </button>
    </header>
  )
}

export const BALL_STAGGER_MS = 280

/** Trump, the call and the target for this round, in one line. */
function RoundFacts({ view }: { view: View }) {
  const phase = view.phase
  const playing = phase.kind === 'playing' || phase.kind === 'trickPause' ? phase : null
  const facts: React.ReactNode[] = []

  if (playing?.thunee) {
    facts.push(`Thunee: ${seatName(view, playing.thunee.caller)} must win every trick`)
    if (playing.trump) facts.push(<Trump suit={playing.trump} />)
  } else if (playing) {
    facts.push(playing.trump ? <Trump suit={playing.trump} /> : 'Trump shows after the first card')
    if (playing.callAmount > 0) facts.push(`Call ${playing.callAmount}`)
    const counting = (1 - teamOf(playing.trumper)) as Team
    const target = view.playerCount === 2 ? view.rules.twoPlayerTarget : 105
    const who = view.seat !== null && teamOf(view.seat) === counting ? 'You count' : `${teamName(view, counting)} count`
    facts.push(`${who} to ${target}`)
  } else if (phase.kind === 'thuneeWindow') {
    facts.push(phase.trump ? <Trump suit={phase.trump} /> : 'Trump is chosen')
    if (phase.callAmount > 0) facts.push(`Call ${phase.callAmount}`)
  } else if (phase.kind === 'calling' || phase.kind === 'trumpSelection') {
    facts.push(`Round ${view.roundNumber}`, 'No trump yet')
  }
  if (facts.length === 0) return null
  return (
    <ul className="shrink-0 flex flex-wrap justify-center gap-x-2 gap-y-1 px-3 pb-1 text-sm">
      {facts.map((fact, i) => (
        <li key={i} className="fact">
          {fact}
        </li>
      ))}
    </ul>
  )
}

function Trump({ suit }: { suit: Suit }) {
  return (
    <>
      Trump
      <span className="suit-chip" data-red={isRed(suit)} aria-label={SUIT_NAME[suit]}>
        {SUIT_SYMBOL[suit]}
      </span>
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

function SeatBadge({ view, seat, side }: { view: View; seat: Seat; side?: 'left' | 'right' }) {
  const phase = view.phase
  const info = view.seats[seat]
  const count = 'handCounts' in phase ? phase.handCounts[seat] : 0
  const turn = (phase.kind === 'playing' && phase.turn === seat) || (phase.kind === 'trumpSelection' && phase.trumper === seat)
  const away = info.kind === 'human' && !info.connected
  const persona = personaLabel(info)
  return (
    <div className="flex flex-col items-center gap-1 max-w-24" data-side={side}>
      <p className="seat-name truncate max-w-full text-sm" data-turn={turn}>
        {info.name}
      </p>
      {persona && <p className="text-xs text-muted">{persona}</p>}
      <div className="flex gap-1 empty:hidden">
        <RoleBadges view={view} seat={seat} />
      </div>
      {said(view, seat).map((text) => (
        <p key={text} className="bubble">
          {text}
        </p>
      ))}
      {(away || info.standIn) && <p className="text-xs text-muted">{info.standIn ? 'computer playing' : 'disconnected'}</p>}
      <div className={`flex ${side ? 'flex-col -space-y-7' : '-space-x-3'}`}>
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="card-in" style={{ animationDelay: `${i * 60}ms` }}>
            <CardBack />
          </span>
        ))}
      </div>
    </div>
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
      return <TrickArea view={view} phase={phase} />
    case 'roundResult':
    case 'gameOver':
      return <RoundResult view={view} summary={phase.summary} winner={phase.kind === 'gameOver' ? phase.winner : null} can={can} />
    case 'lobby':
      return null
  }
}

function Timer({ deadline, totalSeconds }: { deadline: number; totalSeconds: number }) {
  const { store } = useSession()
  const seconds = useCountdown(deadline)
  // The bar runs on its own clock from where the countdown stood when this deadline was first drawn.
  // Frozen per deadline: changing a running animation's duration would make it race ahead.
  const { remaining, fraction } = useMemo(() => {
    const left = Math.max(0, deadline - store.serverNow(Date.now()))
    return { remaining: left, fraction: Math.min(1, left / (totalSeconds * 1000)) }
  }, [deadline, totalSeconds, store])
  return (
    <div className="grid gap-1">
      <p className={`display text-3xl text-center ${seconds <= 3 ? 'text-danger' : ''}`} aria-label={`${seconds} seconds left`}>
        {seconds}
      </p>
      <div className="timer-bar" data-urgent={seconds <= 3}>
        <i key={deadline} style={{ '--from': fraction, animationDuration: `${remaining}ms` } as React.CSSProperties} />
      </div>
    </div>
  )
}

function TrumpButtons({ choices, chosen, onChoose }: { choices: TrumpChoice[]; chosen?: TrumpChoice | null; onChoose: (c: TrumpChoice) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {choices.map((choice) => (
        <button key={choice} className="btn" aria-pressed={chosen === choice} onClick={() => onChoose(choice)}>
          {choice === 'lastCard' ? (
            'Last card'
          ) : (
            <span className={`text-2xl ${isRed(choice) ? 'text-danger' : ''}`} aria-label={SUIT_NAME[choice]}>
              {SUIT_SYMBOL[choice]}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

function CallingPanel({ view, phase, can }: { view: View; phase: Extract<ViewPhase, { kind: 'calling' }>; can: Available }) {
  const { send } = useSession()
  const trumper = phase.call?.seat ?? phase.defaultTrumper
  const mine = trumper === view.seat
  return (
    <section className="panel p-3 w-full max-w-xs grid gap-3">
      <Timer deadline={phase.deadline} totalSeconds={view.rules.callTimerSeconds} />
      <p className="text-center">
        {phase.call
          ? `${mine ? 'You called' : `${seatName(view, phase.call.seat)} called`} ${phase.call.amount}.`
          : `${mine ? 'You choose' : `${seatName(view, trumper)} chooses`} trump unless someone calls.`}
      </p>
      {can.preselect.length > 0 && (
        <div className="grid gap-2">
          <p className="text-center text-sm text-on-surface-muted">Pick trump now. It is kept if nobody outcalls you.</p>
          <TrumpButtons choices={can.preselect} chosen={phase.preselect} onChoose={(choice) => send({ type: 'preselectTrump', choice })} />
        </div>
      )}
      {can.calls.length > 0 && (
        <div className="grid gap-2">
          <p className="text-center text-sm text-on-surface-muted">Call to choose trump. The other side starts that many points up.</p>
          <div className="grid grid-cols-4 gap-1.5">
            {can.calls.map((amount) => (
              <button key={amount} className="btn btn-primary btn-small !px-1" onClick={() => send({ type: 'call', amount })} aria-label={`Call ${amount}`}>
                {amount}
              </button>
            ))}
          </div>
          <button className="btn btn-small" onClick={() => send({ type: 'pass' })}>
            Pass
          </button>
        </div>
      )}
      {view.seat !== null && phase.passed.includes(view.seat) && <p className="text-center text-on-surface-muted">You passed.</p>}
    </section>
  )
}

function TrumpPanel({ view, phase, can }: { view: View; phase: Extract<ViewPhase, { kind: 'trumpSelection' }>; can: Available }) {
  const { send } = useSession()
  return (
    <section className="panel p-3 w-full max-w-xs grid gap-3">
      {can.chooseTrump.length > 0 ? (
        <>
          <p className="text-center">Choose trump{phase.callAmount > 0 ? ` for your call of ${phase.callAmount}` : ''}.</p>
          <TrumpButtons choices={can.chooseTrump} onChoose={(choice) => send({ type: 'chooseTrump', choice })} />
          <p className="text-center text-sm text-on-surface-muted">Last card makes trump the suit of the final card you are dealt.</p>
        </>
      ) : (
        <p className="text-center">{seatName(view, phase.trumper)} is choosing trump.</p>
      )}
    </section>
  )
}

function ThuneePanel({ view, phase, can }: { view: View; phase: Extract<ViewPhase, { kind: 'thuneeWindow' }>; can: Available }) {
  const { send } = useSession()
  return (
    <section className="panel p-3 w-full max-w-xs grid gap-3">
      <Timer deadline={phase.deadline} totalSeconds={view.rules.thuneeWindowSeconds} />
      <p className="text-center">
        {phase.pending !== null
          ? `${seatName(view, phase.pending)} wants Thunee. The trumping side can take it instead.`
          : 'Anyone for Thunee? Win all six tricks for 4 balls.'}
      </p>
      {(can.callThunee || can.pass) && (
        <div className="flex gap-2">
          {can.callThunee && (
            <button className="btn btn-danger flex-1" onClick={() => send({ type: 'callThunee' })}>
              Call Thunee
            </button>
          )}
          <button className="btn flex-1" onClick={() => send({ type: 'pass' })}>
            No Thunee
          </button>
        </div>
      )}
    </section>
  )
}

function TrickArea({ view, phase }: { view: View; phase: ViewPlaying }) {
  const me = view.seat ?? 0
  const last = phase.tricks[phase.tricks.length - 1]
  const paused = phase.kind === 'trickPause' && last !== undefined
  const showing = paused ? last.plays : phase.current
  const winner = paused ? last.winner : null
  // The same number while a trick is being played and while it is shown complete, so its cards keep their identity.
  const trickNumber = paused ? phase.tricks.length - 1 : phase.tricks.length
  // A finished trick leaves toward whoever won it.
  const exitTo = last ? TOWARD[position(last.winner, me, view.playerCount)] : { x: 0, y: 0 }
  const area: Record<Where, string> = { top: 'col-start-2 row-start-1', left: 'col-start-1 row-start-2', right: 'col-start-3 row-start-2', bottom: 'col-start-2 row-start-3' }
  return (
    <div className="trick-area" aria-label="Current trick">
      <AnimatePresence custom={exitTo}>
        {showing.map((play) => {
          const where = position(play.seat, me, view.playerCount)
          const mine = play.seat === view.seat
          const from = TOWARD[where]
          return (
            <motion.div
              key={`${trickNumber}-${play.seat}`}
              className={`relative ${area[where]}`}
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
      {winner !== null && <p className="col-start-2 row-start-2 text-center text-sm text-accent">{winner === view.seat ? 'You win it' : `${seatName(view, winner)} wins`}</p>}
    </div>
  )
}

// ── Hint line and actions ────────────────────────────────────────────────

function Hint({ view, can }: { view: View; can: Available }) {
  const phase = view.phase
  if (phase.kind === 'playing') {
    if (phase.turn === view.seat) return <span className="text-accent font-semibold">Your turn{phase.current.length === 0 ? ' to lead' : ''}. Tap a card or drag it onto the table.</span>
    return <>{seatName(view, phase.turn!)} to play.</>
  }
  if (phase.kind === 'trickPause' && can.claimJodhi.length > 0) return <>Your side won the trick. You can call Jodhi now.</>
  if (phase.kind === 'roundResult') return <>Round {view.roundNumber} is over.</>
  return null
}

function ActionBar({ can, playing, onSheet }: { can: Available; playing: ViewPlaying | null; onSheet: (s: SheetName) => void }) {
  const { send } = useSession()
  if (!playing) return <div className="h-12" />
  const canChallenge = can.challengePlay.length > 0 || can.challengeJodhi.length > 0
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 px-2 pb-2 min-h-12">
      {can.claimJodhi.length > 0 && (
        <button className="btn btn-primary attention" onClick={() => onSheet('jodhi')}>
          Call Jodhi
        </button>
      )}
      {can.callDouble && (
        <button className="btn btn-primary attention" onClick={() => send({ type: 'callDouble' })}>
          Call Double
        </button>
      )}
      {can.callKhanaak && (
        <button className="btn btn-primary attention" onClick={() => send({ type: 'callKhanaak' })}>
          Call Khanaak
        </button>
      )}
      <button className="btn btn-quiet btn-small" disabled={!canChallenge} onClick={() => onSheet('challenge')}>
        Challenge
      </button>
    </div>
  )
}

// ── Sheets ───────────────────────────────────────────────────────────────

function JodhiSheet({ can, trump, onDone }: { can: Available; trump: Suit | null; onDone: () => void }) {
  const { send } = useSession()
  const claim = (suit: Suit, withJack: boolean) => {
    send({ type: 'claimJodhi', suit, withJack })
    onDone()
  }
  return (
    <div className="grid gap-3">
      <p>Name the suit you hold the King and Queen of. Opponents can challenge a false call for 4 balls.</p>
      {can.claimJodhi.map((suit) => (
        <div key={suit} className="flex items-center gap-2">
          <span className={`text-2xl w-8 text-center ${isRed(suit) ? 'text-danger' : ''}`} aria-label={SUIT_NAME[suit]}>
            {SUIT_SYMBOL[suit]}
          </span>
          <button className="btn btn-small flex-1" onClick={() => claim(suit, false)}>
            King and Queen, {jodhiPoints(suit, false, trump)}
          </button>
          <button className="btn btn-small flex-1" onClick={() => claim(suit, true)}>
            With the Jack, {jodhiPoints(suit, true, trump)}
          </button>
        </div>
      ))}
    </div>
  )
}

function ChallengeSheet({ view, can, playing, onDone }: { view: View; can: Available; playing: ViewPlaying; onDone: () => void }) {
  const { send } = useSession()
  return (
    <div className="grid gap-3">
      <p>If they broke the rules your side takes 4 balls. If they did not, their side does. Either way the round ends.</p>
      {can.challengePlay.map((seat) => (
        <button
          key={seat}
          className="btn btn-danger"
          onClick={() => {
            send({ type: 'challengePlay', seat })
            onDone()
          }}
        >
          {seatName(view, seat)} did not follow suit
        </button>
      ))}
      {can.challengeJodhi.map((index) => {
        const claim = playing.jodhiClaims[index]
        return (
          <button
            key={index}
            className="btn btn-danger"
            onClick={() => {
              send({ type: 'challengeJodhi', claim: index })
              onDone()
            }}
          >
            {seatName(view, claim.seat)}'s Jodhi in {SUIT_NAME[claim.suit]} is false
          </button>
        )
      })}
    </div>
  )
}

/** The most recent completed trick only: what a player at the table could still picture. */
function LastTrick({ view, playing }: { view: View; playing: ViewPlaying | null }) {
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

function MenuSheet({ view, room, onSheet, now }: { view: View; room: string; onSheet: (s: SheetName) => void; now: number }) {
  const { send } = useSession()
  const [muted, setMutedState] = useState(isMuted)
  const replaceable = replaceableSeats(view, now)
  return (
    <div className="grid gap-4">
      <p className="text-on-surface-muted">
        Game {room}, round {view.roundNumber}. {rulesSummary(view.rules)}.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-small" onClick={() => onSheet('rules')}>
          Rules in this game
        </button>
        <button className="btn btn-small" onClick={() => onSheet('history')}>
          Last trick
        </button>
        <button
          className="btn btn-small"
          aria-pressed={!muted}
          onClick={() => {
            setMuted(!muted)
            setMutedState(!muted)
          }}
        >
          Sound {muted ? 'off' : 'on'}
        </button>
      </div>
      <ThemePicker />
      {replaceable.length > 0 && (
        <div className="grid gap-2">
          <p>Let the computer play for someone who is away. They take the seat back when they return.</p>
          {replaceable.map((seat) => (
            <button key={seat} className="btn btn-small" onClick={() => send({ type: 'replaceWithAi', seat })}>
              Computer plays for {seatName(view, seat)}
            </button>
          ))}
        </div>
      )}
      <button className="btn btn-danger" onClick={() => navigate('/')}>
        Leave game
      </button>
    </div>
  )
}
