import { useEffect, useState } from 'react'
import { partnerOf } from '../../../kit/partners'
import type { Seat } from '../../../kit/table'
import { AccuseSheet } from '../../../ui/Accuse'
import { CallGrid } from '../../../ui/Call'
import { PlayingCard, SuitChip } from '../../../ui/Card'
import { HowToPlaySheet } from '../../../ui/coach/CoachSheets'
import { CoachStrip } from '../../../ui/coach/CoachStrip'
import { GameMenu } from '../../../ui/GameMenu'
import { Hand, HandDown } from '../../../ui/Hand'
import { NO_PICKS, type Picks, pickFrom, pickedFrom } from '../../../ui/hands'
import { RulesSheet, rulesSummary } from '../../../ui/Rules'
import { SeatBadge, TakeOver, usePosition } from '../../../ui/Seat'
import { TOWARD, type Where } from '../../../ui/seats'
import { useGameClient } from '../../../ui/session'
import { Sheet } from '../../../ui/Sheet'
import { playSound } from '../../../ui/sound'
import { TalkMine } from '../../../ui/talk/Said'
import { TalkButton } from '../../../ui/talk/Tray'
import { seatName } from '../../../ui/text'
import { LastTrick, NO_TRICK, TrickArea, useGathering } from '../../../ui/Trick'
import { TOPICS } from '../coach/topics'
import {
  type Available,
  type Card,
  EXCHANGE_SIZE,
  type View,
  type ViewCalling,
  type ViewDrawing,
  type ViewExchanging,
  type ViewPlaying,
  availableActions,
  handSize,
  seatsOf,
  sideCount,
  sideOf,
} from '../engine'
import { sideColour } from './present'
import { RoundResult } from './RoundResult'
import { useCoach, useSession } from './session'
import { callText, hint, newCards, points, sideName, sortHand, tally } from './text'

type SheetName = 'menu' | 'history' | 'rules' | 'challenge' | 'howto' | null

export function Table({ view, room }: { view: View; room: string }) {
  const { send } = useSession()
  const game = useGameClient()
  const position = usePosition(view)
  const [sheet, setSheet] = useState<SheetName>(null)
  const me = view.seat ?? 0
  const watching = view.seat === null
  const phase = view.phase
  const can = availableActions(view)
  // The two cards picked to give in a Blind nil exchange, until they are sent.
  const [picks, setPicks] = useState<Picks<Card>>(NO_PICKS)
  const picked = pickedFrom(picks, can.give)
  const myTurn = phase.kind === 'playing' && phase.turn === view.seat
  const coached = useCoach()
  const advised = coached?.state.showHint ? coached.state.advice?.action : undefined
  const coach = coached?.coach
  // In practice the table waits while the player reads any sheet.
  useEffect(() => {
    coach?.setReading('table', sheet !== null)
  }, [coach, sheet])

  const others = view.seats.map((_, seat) => seat).filter((seat) => seat !== me)
  const at = (where: Where, side?: 'left' | 'right') => {
    const seat = others.find((s) => position(s) === where)
    return seat === undefined ? null : <SpadesSeat view={view} seat={seat} side={side} />
  }
  const playing = phase.kind === 'playing' || phase.kind === 'trickPause' ? phase : null
  const ended = phase.kind === 'roundResult' || phase.kind === 'gameOver'
  // The round's result takes the table once its last trick has been gathered in.
  const gathering = useGathering(ended, phase.kind === 'trickPause')
  const over = ended && !gathering
  const hand = 'hand' in phase ? sortHand(phase.hand, view.rules.jokers) : []
  const down = phase.kind === 'calling' && !watching && !phase.looked[me]
  const line = hint(view)
  const most = handSize(view.playerCount)

  return (
    <div className="h-[calc(100dvh-var(--update-h,0px))] flex flex-col overflow-hidden" data-felt-table>
      <StatusStrip view={view} onMenu={() => setSheet('menu')} onTricks={() => setSheet('history')} />

      {over ? (
        <div className="flex-1 min-h-0 overflow-y-auto grid justify-items-center items-start px-3 py-2">
          <RoundResult view={view} summary={phase.summary} winner={phase.kind === 'gameOver' ? phase.winner : null} can={can} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-rows-[auto_1fr] grid-cols-[minmax(0,1fr)] gap-1 px-2">
          <div className="flex justify-center">{at('top')}</div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[minmax(0,1fr)] items-center gap-1 min-h-0">
            <div className="self-stretch min-h-0">{at('left', 'left')}</div>
            {/* The trick keeps one place all round, empty under the panels, so the rays behind it never move. */}
            <div className="trick-stage relative h-full min-h-0 flex items-center justify-center py-1">
              <TrickMiddle view={view} playing={playing} />
              {!playing && !gathering && !ended && (
                <div className="centre-box absolute inset-0 flex justify-center items-center-safe overflow-y-auto py-1">
                  <Centre view={view} can={can} />
                </div>
              )}
            </div>
            <div className="self-stretch min-h-0">{at('right', 'right')}</div>
          </div>
        </div>
      )}

      <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
        {coached && <CoachStrip lessons={TOPICS} over={over} />}
        {/* The player's line, one row: what to do, and the buttons that act now, with the talk button at its right end. */}
        <div className="hint-row player-line" aria-live="polite">
          {!coached && <span className="player-cue">{watching ? 'You are watching this game.' : line?.mine ? <b className="cue">{line.text}</b> : line?.text}</span>}
          {!watching && !over && <ActionButtons view={view} can={can} picked={picked} onSheet={setSheet} />}
          <TalkButton />
        </div>
        {can.reclaimSeat && <TakeOver />}
        {watching ? (
          <div className="flex justify-center pb-3">
            <SpadesSeat view={view} seat={0} />
          </div>
        ) : over ? null : (
          <div className="relative">
            <div className="hand-tags" data-seat-name={me}>
              {view.dealer === me && !ended && <span className="role-badge">Dealer</span>}
              <MyTally view={view} />
              <TalkMine />
            </div>
            {down ? (
              <HandDown count={'handCounts' in phase ? phase.handCounts[me] : 0} most={most} />
            ) : (
              <Hand
                cards={hand}
                playable={myTurn}
                legal={can.legal}
                // A rule-breaking card asks for a second tap, but only where the table would take it: never at a forced lead.
                anyway={can.play.length > can.legal.length}
                dealFrom={TOWARD[position(view.dealer)]}
                onPlay={(card) => send({ type: 'playCard', card })}
                suggested={advised?.type === 'playCard' ? advised.card : null}
                explain={coached ? (card) => coached.coach.check({ type: 'playCard', card })?.body ?? null : undefined}
                most={most}
                choose={
                  phase.kind === 'exchanging' && can.give.length > 0
                    ? { picked, onPick: (card) => setPicks((p) => pickFrom(p, can.give, card, EXCHANGE_SIZE)) }
                    : undefined
                }
                marked={playing ? newCards(view, playing) : []}
              />
            )}
          </div>
        )}
      </div>

      {sheet === 'menu' && (
        <Sheet title="Menu" onClose={() => setSheet(null)}>
          <MenuSheet view={view} room={room} onSheet={setSheet} onRestart={() => setPicks(NO_PICKS)} />
        </Sheet>
      )}
      {sheet === 'howto' && <HowToPlaySheet lessons={TOPICS} onClose={() => setSheet(null)} />}
      {sheet === 'rules' && <RulesSheet game={game} rules={view.rules} onClose={() => setSheet(null)} />}
      {sheet === 'history' && (
        <Sheet title="Last trick" onClose={() => setSheet(null)}>
          <LastTrick view={view} playing={playing} />
        </Sheet>
      )}
      {sheet === 'challenge' && (
        <AccuseSheet
          title={view.rules.renege === 'set' ? 'Challenge, and end the round' : 'Challenge for three tricks'}
          risk={
            view.rules.renege === 'set'
              ? 'Every card they have played this round is checked. If one broke a rule, their side is set and yours scores what it called; if none did, your side is set instead. Either way the round ends now.'
              : 'Every card they have played since they were last checked is checked. If one broke a rule, their side must take three more tricks, or a Nil of theirs still standing is lost; if none did, the same falls on you. Play goes on.'
          }
          accusations={can.challengePlay
            .filter((seat) => sideOf(seat, view.playerCount) !== sideOf(me, view.playerCount) || watching)
            .map((seat) => ({
              key: String(seat),
              label: `${seatName(view, seat)} broke a rule`,
              send: () => send({ type: 'challengePlay', seat }),
            }))}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}

// ── The scores ───────────────────────────────────────────────────────────

/** A side's tricks this round against its contract: "3 of 5", or "Nil". */
function sideTally(view: View, playing: ViewPlaying, side: number): { text: string; made: boolean; broken: boolean } {
  const seats = seatsOf(side, view.playerCount)
  const contract = playing.contracts[side]
  if (contract === 0) {
    const broken = seats.some((s) => playing.taken[s] > 0 || playing.nilFailed[s])
    return { text: broken ? 'Nil broken' : 'Nil', made: false, broken }
  }
  const tricks = seats.reduce((n, s) => n + (playing.calls[s].tricks > 0 ? playing.taken[s] : 0), 0)
  const over = tricks - contract
  return { text: `${Math.min(tricks, contract)} of ${contract}${over > 0 ? ` +${over}` : ''}`, made: tricks >= contract, broken: false }
}

/** One ticket per side: its score, its bags, and in play its tricks against its contract. */
function StatusStrip({ view, onMenu, onTricks }: { view: View; onMenu: () => void; onTricks: () => void }) {
  const phase = view.phase
  const playing = phase.kind === 'playing' || phase.kind === 'trickPause' ? phase : null
  const sides = Array.from({ length: sideCount(view.playerCount) }, (_, side) => side)
  const three = sides.length === 3
  return (
    <header
      className={`shrink-0 grid ${three ? 'grid-cols-[1fr_1fr_1fr_auto]' : 'grid-cols-[1fr_auto_1fr]'} items-start gap-2 px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1`}
    >
      {sides.map((side) => {
        const right = !three && side === 1
        const t = playing ? sideTally(view, playing, side) : null
        return (
          <div key={side} className={`min-w-0 grid gap-1 ${right ? 'order-3' : ''}`}>
            <div className="ticket max-w-full" data-team={right ? 1 : 0} style={{ '--team': sideColour(side), '--on-team': `var(--on-team${side})` } as React.CSSProperties}>
              <b className="ticket-num tabular-nums" aria-label={`${view.scores[side] ?? 0} points`}>
                {points(view.scores[side] ?? 0)}
              </b>
              <span className="ticket-who">
                <span className="ticket-name">{sideName(view, side)}</span>
                {view.rules.bagPenalty && !three ? (
                  <span className="pip-track" style={{ gridTemplateColumns: 'repeat(5, 0.45rem)' }} aria-label={`${(view.bags[side] ?? 0) % 10} bags`}>
                    {Array.from({ length: 10 }, (_, i) => (
                      <i key={i} data-on={i < (view.bags[side] ?? 0) % 10} />
                    ))}
                  </span>
                ) : (
                  <span className="text-xs whitespace-nowrap">{(view.bags[side] ?? 0) % (view.rules.bagPenalty ? 10 : Number.POSITIVE_INFINITY)} bags</span>
                )}
              </span>
            </div>
            {t !== null ? (
              <button className={`trick-pile ${right ? 'justify-self-end' : ''}`} data-made={t.made} data-broken={t.broken} onClick={onTricks} aria-label={`${t.text}. Show the last trick.`}>
                <span aria-hidden className="trick-pile-icon" />
                {t.text}
              </button>
            ) : (
              <span aria-hidden className="trick-pile invisible">
                <span className="trick-pile-icon" />0 of 0
              </span>
            )}
          </div>
        )
      })}
      <button className={`${three ? '' : 'order-2'} btn btn-small`} onClick={onMenu} aria-label="Open menu">
        Menu
      </button>
    </header>
  )
}

// ── Seats ────────────────────────────────────────────────────────────────

/** A seat's call and tricks, on a plate in its side's colour with four. */
function TallyLine({ view, seat }: { view: View; seat: Seat }) {
  const phase = view.phase
  if (!('calls' in phase)) return null
  const t = tally({ calls: phase.calls, taken: 'taken' in phase ? phase.taken : undefined, nilFailed: 'nilFailed' in phase ? phase.nilFailed : undefined }, seat)
  // Before its call a seat shows a plain dash; after, with four, its call on its side's colour.
  const pair = view.playerCount === 4 && phase.calls[seat] !== null
  const style = pair ? ({ background: sideColour(sideOf(seat, 4)), color: `var(--on-team${sideOf(seat, 4)})` } as React.CSSProperties) : undefined
  return (
    <span className={`tally ${pair ? 'tally-plate' : ''}`} data-broken={t.broken} style={style}>
      {t.text}
    </span>
  )
}

function MyTally({ view }: { view: View }) {
  if (view.seat === null || !('calls' in view.phase)) return null
  return <TallyLine view={view} seat={view.seat} />
}

/** Another player: dealer, its call as it is made, its tally, its cards face down. */
function SpadesSeat({ view, seat, side }: { view: View; seat: Seat; side?: 'left' | 'right' }) {
  const phase = view.phase
  const count = 'handCounts' in phase ? phase.handCounts[seat] : 0
  const turn = ('turn' in phase && phase.turn === seat) || false
  const said = phase.kind === 'calling' && phase.calls[seat] ? [`${callText(phase.calls[seat]!)}!`] : []
  return (
    <SeatBadge
      view={view}
      seat={seat}
      side={side}
      turn={turn}
      choosing={phase.kind === 'playing' && turn}
      count={count}
      tags={view.dealer === seat && phase.kind !== 'lobby' && <span className="role-badge">Dealer</span>}
      said={said}
    >
      <TallyLine view={view} seat={seat} />
    </SeatBadge>
  )
}

// ── Centre of the table ──────────────────────────────────────────────────

/** The trick, and under it whether spades are broken. Out of play it keeps its place, empty, with the line hidden. */
function TrickMiddle({ view, playing }: { view: View; playing: ViewPlaying | null }) {
  return (
    <div className="flex flex-col items-center">
      <TrickArea view={view} phase={playing ?? NO_TRICK} />
      <ul className={`trick-below flex flex-wrap justify-center gap-x-2 gap-y-1 text-sm ${playing ? '' : 'invisible'}`}>
        <li className="fact" data-on={playing?.spadesBroken ?? false}>
          Spades {playing?.spadesBroken ? 'broken' : 'not broken'}
          <SuitChip suit="spades" />
        </li>
      </ul>
    </div>
  )
}

function Centre({ view, can }: { view: View; can: Available }) {
  const phase = view.phase
  switch (phase.kind) {
    case 'drawing':
      return <DrawPanel view={view} phase={phase} can={can} />
    case 'calling':
      return <CallPanel view={view} phase={phase} can={can} />
    case 'exchanging':
      return <ExchangePanel view={view} phase={phase} />
    default:
      return null
  }
}

/** Two players: the stock, and on the viewer's turn its top card with Keep and Discard. */
function DrawPanel({ view, phase, can }: { view: View; phase: ViewDrawing; can: Available }) {
  const { send } = useSession()
  const draw = (keep: boolean) => {
    playSound('tap')
    send({ type: 'draw', keep })
  }
  return (
    <section className="panel p-3 w-full max-w-xs grid gap-2 justify-items-center text-center">
      <p className="text-sm text-on-surface-muted">{phase.stockCount} left in the stock</p>
      {can.draw && phase.top ? (
        <>
          <PlayingCard card={phase.top} size="trick" />
          <p className="text-sm">Keep it, and the next card is discarded; or discard it, and take the next unseen.</p>
          <div className="grid grid-cols-2 gap-2 w-full">
            <button className="btn btn-primary" onClick={() => draw(true)}>
              Keep
            </button>
            <button className="btn" onClick={() => draw(false)}>
              Discard
            </button>
          </div>
        </>
      ) : (
        <p>{seatName(view, phase.turn)} is drawing.</p>
      )}
      <Discards cards={phase.discards} />
    </section>
  )
}

/** Two players: every card the viewer has discarded, newest last, so a Keep shows the card it threw away. */
function Discards({ cards }: { cards: readonly Card[] }) {
  if (cards.length === 0) return null
  return (
    <div className="grid gap-1 justify-items-center">
      <p className="text-sm text-on-surface-muted">You discarded</p>
      <div className="flex flex-wrap justify-center gap-1">
        {cards.map((c) => (
          <PlayingCard key={`${c.rank}${c.suit}`} card={c} size="small" style={{ '--w': '2.2rem' } as React.CSSProperties} />
        ))}
      </div>
    </div>
  )
}

/** Calling: whose call it is, the partner's, and on the viewer's turn the numbers and Nil. */
function CallPanel({ view, phase, can }: { view: View; phase: ViewCalling; can: Available }) {
  const { send } = useSession()
  const me = view.seat
  const commit = (action: Parameters<typeof send>[0]) => {
    playSound('tap')
    send(action)
  }
  const partner = me === null ? null : partnerOf(me, view.playerCount)
  const partnerCall = partner === null ? null : phase.calls[partner]
  const looked = me === null || phase.looked[me]
  const myTurn = phase.turn === me
  return (
    <section className="panel p-3 w-full max-w-sm grid gap-3">
      <p className="text-center">
        {myTurn ? 'Your call: how many tricks will you take?' : (
          <>
            <b className="text-accent">{seatName(view, phase.turn)}</b> to call
          </>
        )}
      </p>
      {partner !== null && (
        <p className="text-center text-sm text-on-surface-muted">
          {partnerCall ? `${seatName(view, partner)} called ${callText(partnerCall)}.` : `${seatName(view, partner)} calls after you.`}
        </p>
      )}
      <Discards cards={phase.discards} />
      {!looked && (
        <div className="grid gap-2">
          <p className="text-center text-sm">Your side is far enough behind to call Blind nil: no tricks, before you look, for 200.</p>
          <button className="btn" onClick={() => commit({ type: 'lookAtHand' })}>
            See my cards
          </button>
          {can.blindNil && (
            <button className="btn btn-danger" onClick={() => commit({ type: 'callBlindNil' })}>
              Blind nil
            </button>
          )}
        </div>
      )}
      {can.calls.length > 0 && (
        <CallGrid
          numbers={can.calls.filter((n) => n > 0)}
          onCall={(tricks) => commit({ type: 'call', tricks })}
          label={(tricks) => `Call ${tricks}`}
          named={can.calls.includes(0) ? [{ label: 'Nil', onClick: () => commit({ type: 'call', tricks: 0 }) }] : []}
        />
      )}
    </section>
  )
}

/** After a Blind nil: who gives two cards to whom, and what the viewer was given. */
function ExchangePanel({ view, phase }: { view: View; phase: ViewExchanging }) {
  const { blind } = phase.exchange
  const partner = partnerOf(blind, view.playerCount)!
  const me = view.seat
  const party = me === blind || me === partner
  return (
    <section className="panel p-3 w-full max-w-xs grid gap-2 text-center">
      <h2 className="display text-lg">Blind nil</h2>
      <p>
        {seatName(view, blind)} gives two cards to {seatName(view, partner)}, who gives two back.
      </p>
      {party && phase.exchange.gave && me === partner && (
        <div className="flex justify-center gap-1">
          {phase.exchange.gave.map((c) => (
            <PlayingCard key={`${c.rank}${c.suit}`} card={c} size="trick" />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Actions and the menu ─────────────────────────────────────────────────

function ActionButtons({ view, can, picked, onSheet }: { view: View; can: Available; picked: Card[]; onSheet: (s: SheetName) => void }) {
  const { send } = useSession()
  const phase = view.phase
  if (phase.kind === 'exchanging' && can.give.length > 0) {
    const ready = picked.length === EXCHANGE_SIZE
    const to = view.seat === phase.exchange.blind ? partnerOf(view.seat, view.playerCount)! : phase.exchange.blind
    return (
      <button
        className={`btn btn-primary btn-small ml-auto shrink-0 ${ready ? 'attention' : ''}`}
        disabled={!ready}
        onClick={() => {
          playSound('tap')
          send({ type: 'giveCards', cards: picked })
        }}
      >
        Give two to {seatName(view, to)}
      </button>
    )
  }
  if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return null
  const me = view.seat ?? 0
  const opponents = can.challengePlay.filter((s) => sideOf(s, view.playerCount) !== sideOf(me, view.playerCount))
  return (
    <span className="ml-auto flex shrink-0 gap-2">
      {phase.tricks.length > 0 && (
        <button className="btn btn-quiet btn-small" onClick={() => onSheet('history')}>
          Last trick
        </button>
      )}
      {view.rules.allowCheating && opponents.length > 0 && (
        <button className="btn btn-quiet btn-small" onClick={() => onSheet('challenge')}>
          Challenge
        </button>
      )}
    </span>
  )
}

/** `onRestart`: a new practice game drops what was picked in the old one. */
function MenuSheet({ view, room, onSheet, onRestart }: { view: View; room: string; onSheet: (s: SheetName) => void; onRestart: () => void }) {
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
                  onRestart()
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
