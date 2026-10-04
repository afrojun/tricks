import { useEffect, useState } from 'react'
import {
  type Available,
  type Card,
  type Seat,
  type Suit,
  type TrumpChoice,
  type View,
  type ViewPhase,
  type ViewPlaying,
  availableActions,
  jodhiPoints,
  replaceableSeats,
  sameCard,
  teamOf,
} from '../engine'
import { CardBack, PlayingCard } from './Card'
import { RoundResult } from './RoundResult'
import { RulesList, rulesSummary } from './Rules'
import { Sheet } from './Sheet'
import { ThemePicker } from './ThemePicker'
import { navigate, useCountdown, useSession } from './session'
import { isMuted, playSound, setMuted } from './sound'
import { SUIT_NAME, SUIT_SYMBOL, cardText, isRed, seatName, sortHand, teamName } from './text'

type SheetName = 'menu' | 'history' | 'rules' | 'jodhi' | 'challenge' | null

/** Where a seat sits on screen relative to the viewer, who is always at the bottom. */
function position(seat: Seat, me: Seat, n: number): 'bottom' | 'right' | 'top' | 'left' {
  const offset = (seat - me + n) % n
  if (n === 2) return offset === 0 ? 'bottom' : 'top'
  return (['bottom', 'right', 'top', 'left'] as const)[offset]
}

export function Table({ view, room }: { view: View; room: string }) {
  const { send, store } = useSession()
  const [sheet, setSheet] = useState<SheetName>(null)
  const [selected, setSelected] = useState<Card | null>(null)
  const me = view.seat ?? 0
  const watching = view.seat === null
  const phase = view.phase
  const can = availableActions(view)
  const myTurn = phase.kind === 'playing' && phase.turn === view.seat

  useEffect(() => {
    if (myTurn) playSound('yourTurn')
  }, [myTurn])
  useEffect(() => setSelected(null), [phase.kind, myTurn])

  const others = view.seats.map((_, seat) => seat).filter((seat) => seat !== me || watching)
  const at = (where: string) => others.find((seat) => position(seat, me, view.playerCount) === where)
  const hand = 'hand' in phase ? sortHand(phase.hand) : []
  const playing = phase.kind === 'playing' || phase.kind === 'trickPause' ? phase : null

  const play = (card: Card) => {
    const legal = can.legal.some((c) => sameCard(c, card))
    if (legal || (selected && sameCard(selected, card))) {
      send({ type: 'playCard', card })
      setSelected(null)
    } else setSelected(card) // breaking a rule takes a second tap
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <StatusStrip view={view} onMenu={() => setSheet('menu')} />

      <div className="flex-1 min-h-0 grid grid-rows-[auto_1fr] gap-1 px-2">
        <div className="flex justify-center">{at('top') !== undefined && <SeatBadge view={view} seat={at('top')!} />}</div>
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-1 min-h-0">
          <div>{at('left') !== undefined && <SeatBadge view={view} seat={at('left')!} side />}</div>
          <div className="h-full min-h-0 flex items-center justify-center overflow-y-auto py-1">
            <Centre view={view} can={can} />
          </div>
          <div>{at('right') !== undefined && <SeatBadge view={view} seat={at('right')!} side />}</div>
        </div>
      </div>

      <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
        <p className="text-center px-3 min-h-6" aria-live="polite">
          {watching ? 'You are watching this game.' : <Hint view={view} can={can} selected={selected} />}
        </p>
        {!watching && (
          <>
            <div className="hand">
              {hand.map((card, i) => {
                const legal = can.legal.some((c) => sameCard(c, card))
                const tilt = (i - (hand.length - 1) / 2) * 4
                return (
                  <PlayingCard
                    key={cardText(card)}
                    card={card}
                    playable={myTurn}
                    dim={myTurn && !legal}
                    selected={selected !== null && sameCard(selected, card)}
                    onClick={() => play(card)}
                    style={{ '--tilt': `${tilt}deg` } as React.CSSProperties}
                  />
                )
              })}
            </div>
            <ActionBar view={view} can={can} playing={playing} onSheet={setSheet} />
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
        <Sheet title="Tricks this round" onClose={() => setSheet(null)}>
          <History view={view} playing={playing} />
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

function StatusStrip({ view, onMenu }: { view: View; onMenu: () => void }) {
  const phase = view.phase
  const playing = phase.kind === 'playing' || phase.kind === 'trickPause' ? phase : null
  const trump = playing?.trump ?? (phase.kind === 'thuneeWindow' ? phase.trump : null)
  const call = playing?.callAmount ?? ('callAmount' in phase ? phase.callAmount : phase.kind === 'calling' ? (phase.call?.amount ?? 0) : 0)
  const myTeam = view.seat === null ? null : teamOf(view.seat)

  return (
    <header className="shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
      {([0, 1] as const).map((team) => (
        <div key={team} className={`min-w-0 ${team === 1 ? 'order-3 text-right' : ''}`} style={{ color: team === 0 ? 'var(--team0)' : 'var(--team1)' }}>
          <p className="truncate text-sm">{teamName(view, team, myTeam === team ? view.seat : null)}</p>
          <div className={`pip-track ${team === 1 ? 'justify-end' : ''}`} aria-label={`${view.balls[team]} of ${view.ballsTarget} balls`}>
            {Array.from({ length: view.ballsTarget }, (_, i) => (
              <i key={i} data-on={i < view.balls[team]} />
            ))}
          </div>
        </div>
      ))}
      <button className="order-2 btn btn-quiet btn-small flex-col !gap-0 !py-1" onClick={onMenu} aria-label="Open menu">
        <span className="leading-none whitespace-nowrap">
          {playing?.thunee ? (
            'Thunee'
          ) : trump ? (
            <>
              Trump <span className={isRed(trump) ? 'text-danger' : ''}>{SUIT_SYMBOL[trump]}</span>
            </>
          ) : phase.kind === 'calling' || phase.kind === 'trumpSelection' || phase.kind === 'thuneeWindow' ? (
            'No trump yet'
          ) : (
            `Round ${view.roundNumber}`
          )}
        </span>
        <span className="text-sm leading-none opacity-80">{call > 0 ? `Call ${call}` : 'Menu'}</span>
      </button>
    </header>
  )
}

function SeatBadge({ view, seat, side }: { view: View; seat: Seat; side?: boolean }) {
  const phase = view.phase
  const info = view.seats[seat]
  const count = 'handCounts' in phase ? phase.handCounts[seat] : 0
  const turn = (phase.kind === 'playing' && phase.turn === seat) || (phase.kind === 'trumpSelection' && phase.trumper === seat)
  const away = info.kind === 'human' && !info.connected
  return (
    <div className={`flex ${side ? 'flex-col' : 'flex-col'} items-center gap-1 max-w-24`}>
      <p className={`truncate max-w-full text-sm ${turn ? 'text-accent turn-marker font-semibold' : 'text-muted'}`}>
        {info.name}
        {view.dealer === seat && ' (D)'}
      </p>
      {(away || info.standIn) && <p className="text-xs text-muted">{info.standIn ? 'computer playing' : 'disconnected'}</p>}
      <div className={`flex ${side ? 'flex-col -space-y-7' : '-space-x-3'}`}>
        {Array.from({ length: count }, (_, i) => (
          <CardBack key={i} />
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

function Timer({ deadline }: { deadline: number }) {
  const seconds = useCountdown(deadline)
  return (
    <p className={`display text-3xl text-center ${seconds <= 3 ? 'text-danger' : ''}`} aria-label={`${seconds} seconds left`}>
      {seconds}
    </p>
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
      <Timer deadline={phase.deadline} />
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
          <div className="flex flex-wrap justify-center gap-2">
            {can.calls.slice(0, 4).map((amount) => (
              <button key={amount} className="btn btn-primary btn-small" onClick={() => send({ type: 'call', amount })}>
                Call {amount}
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
      <Timer deadline={phase.deadline} />
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
  const showing = phase.kind === 'trickPause' && last ? last.plays : phase.current
  const winner = phase.kind === 'trickPause' && last ? last.winner : null
  const area: Record<string, string> = { top: 'col-start-2 row-start-1', left: 'col-start-1 row-start-2', right: 'col-start-3 row-start-2', bottom: 'col-start-2 row-start-3' }
  return (
    <div className="trick-area" aria-label="Current trick">
      {showing.map((play) => (
        <div key={play.seat} className={`${area[position(play.seat, me, view.playerCount)]} card-in`}>
          <PlayingCard card={play.card} size="trick" className={winner === play.seat ? 'winner-ring' : ''} />
        </div>
      ))}
      {winner !== null && <p className="col-start-2 row-start-2 text-center text-sm text-accent">{winner === view.seat ? 'You win it' : `${seatName(view, winner)} wins`}</p>}
    </div>
  )
}

// ── Hint line and actions ────────────────────────────────────────────────

function Hint({ view, can, selected }: { view: View; can: Available; selected: Card | null }) {
  const phase = view.phase
  if (selected) return <span className="text-danger">Not a legal play. Tap {cardText(selected)} again to play it anyway.</span>
  if (phase.kind === 'playing') {
    if (phase.turn === view.seat) return <span className="text-accent font-semibold">Your turn{phase.current.length === 0 ? ' to lead' : ''}.</span>
    return <>{seatName(view, phase.turn!)} to play.</>
  }
  if (phase.kind === 'trickPause' && can.claimJodhi.length > 0) return <>Your side won the trick. You can call Jodhi now.</>
  if (phase.kind === 'roundResult') return <>Round {view.roundNumber} is over.</>
  return null
}

function ActionBar({ view, can, playing, onSheet }: { view: View; can: Available; playing: ViewPlaying | null; onSheet: (s: SheetName) => void }) {
  const { send } = useSession()
  if (!playing) return <div className="h-12" />
  const canChallenge = can.challengePlay.length > 0 || can.challengeJodhi.length > 0
  return (
    <div className="flex flex-wrap justify-center gap-2 px-2 pb-2 min-h-12">
      {can.claimJodhi.length > 0 && (
        <button className="btn btn-primary btn-small" onClick={() => onSheet('jodhi')}>
          Jodhi
        </button>
      )}
      {can.callDouble && (
        <button className="btn btn-primary btn-small" onClick={() => send({ type: 'callDouble' })}>
          Double
        </button>
      )}
      {can.callKhanaak && (
        <button className="btn btn-primary btn-small" onClick={() => send({ type: 'callKhanaak' })}>
          Khanaak
        </button>
      )}
      <button className="btn btn-danger btn-small" disabled={!canChallenge} onClick={() => onSheet('challenge')}>
        Challenge
      </button>
      <button className="btn btn-quiet btn-small" onClick={() => onSheet('history')}>
        Tricks {playing.tricks.filter((t) => teamOf(t.winner) === teamOf(view.seat ?? 0)).length}–
        {playing.tricks.filter((t) => teamOf(t.winner) !== teamOf(view.seat ?? 0)).length}
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

function History({ view, playing }: { view: View; playing: ViewPlaying | null }) {
  if (!playing || playing.tricks.length === 0) return <p>No tricks have been played this round.</p>
  return (
    <ol className="grid gap-3">
      {playing.tricks.map((trick, i) => (
        <li key={i} className="grid gap-1 border-b border-line/40 pb-2">
          <p className="text-sm text-on-surface-muted">
            Trick {i + 1}, won by {seatName(view, trick.winner)}
          </p>
          <div className="flex gap-2">
            {trick.plays.map((play) => (
              <div key={play.seat} className="grid justify-items-center gap-1">
                <PlayingCard card={play.card} size="trick" className={play.seat === trick.winner ? 'winner-ring' : ''} />
                <span className="text-xs truncate max-w-14">{seatName(view, play.seat)}</span>
              </div>
            ))}
          </div>
        </li>
      ))}
      {playing.jodhiClaims.length > 0 && (
        <li>
          <p className="font-semibold">Jodhi called</p>
          {playing.jodhiClaims.map((j, i) => (
            <p key={i}>
              {seatName(view, j.seat)}: {j.points} in {SUIT_NAME[j.suit]}
            </p>
          ))}
        </li>
      )}
    </ol>
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
          Tricks this round
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
