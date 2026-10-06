import { useEffect, useState } from 'react'
import { type Available, type Card, HAND_SIZE, PASS_SIZE, type View, type ViewPhase, type ViewPlaying, availableActions, passTarget } from '../engine'
import type { Seat } from '../../../kit/table'
import { AccuseSheet } from '../../../ui/Accuse'
import { CoachStrip } from '../../../ui/coach/CoachStrip'
import { GameMenu } from '../../../ui/GameMenu'
import { Hand } from '../../../ui/Hand'
import { togglePick } from '../../../ui/hands'
import { RulesSheet, rulesSummary } from '../../../ui/Rules'
import { SeatBadge, TakeOver, usePosition, useTurnAlert } from '../../../ui/Seat'
import { Sheet } from '../../../ui/Sheet'
import { LastTrick, TrickArea } from '../../../ui/Trick'
import { TOWARD, type Where } from '../../../ui/seats'
import { useGameClient } from '../../../ui/session'
import { seatName } from '../../../ui/text'
import { RoundResult } from './RoundResult'
import { useCoach, useSession } from './session'
import { hint, newCards, passButton, passedWay, points, sortHand, trickTaken } from './text'

type SheetName = 'menu' | 'history' | 'rules' | 'challenge' | null
type PassWay = Exclude<View['direction'], 'none'>

/** Hearts has no written lessons yet, so the coach's notes link to none. */
const NO_LESSONS = {}

/** Whom everyone gives their three cards to, by the round's direction. */
const PASS_RULE: Record<PassWay, string> = {
  left: 'Everyone gives three cards to the player on their left.',
  right: 'Everyone gives three cards to the player on their right.',
  across: 'Everyone gives three cards to the player opposite.',
}

/** Points each seat has taken this round: in play as the tricks stand, after it as scored. */
function takenThisRound(view: View): number[] {
  const phase = view.phase
  if (phase.kind === 'playing' || phase.kind === 'trickPause') return phase.taken
  if (phase.kind === 'roundResult' || phase.kind === 'gameOver') return phase.summary.points
  return view.seats.map(() => 0)
}

export function Table({ view, room }: { view: View; room: string }) {
  const { send, store } = useSession()
  const game = useGameClient()
  const position = usePosition(view)
  const [sheet, setSheet] = useState<SheetName>(null)
  // The cards picked to pass, until they are sent. Every deal starts a new choice.
  const [picked, setPicked] = useState<Card[]>([])
  useEffect(
    () =>
      store.onEvent((event) => {
        if (event.type === 'dealt') setPicked([])
      }),
    [store],
  )
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
  useTurnAlert(myTurn)

  const others = view.seats.map((_, seat) => seat).filter((seat) => seat !== me)
  const at = (where: Where, side?: 'left' | 'right') => {
    const seat = others.find((s) => position(s) === where)
    return seat === undefined ? null : <HeartsSeat view={view} seat={seat} side={side} />
  }
  const playing = phase.kind === 'playing' || phase.kind === 'trickPause' ? phase : null
  const hand = 'hand' in phase ? sortHand(phase.hand) : []
  const line = hint(view, picked.length)
  // Cards passed to the viewer arrive from the player who gave them; a new deal from across the table.
  const way = view.direction
  const giver = way === 'none' ? undefined : others.find((s) => passTarget(s, way) === me)
  const dealFrom = playing && giver !== undefined ? TOWARD[position(giver)] : TOWARD.top

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <header className="shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 text-sm">
        <p className="text-muted">Round {view.roundNumber}</p>
        <button className="btn btn-quiet btn-small" onClick={() => setSheet('menu')} aria-label="Open menu">
          Menu
        </button>
        <p className="text-muted text-right">Ends at {view.rules.gameEndsAt}</p>
      </header>

      {phase.kind === 'roundResult' || phase.kind === 'gameOver' ? (
        // The result needs the width; the seats' points are in its table.
        <div className="flex-1 min-h-0 overflow-y-auto grid justify-items-center items-start px-3 py-2">
          <RoundResult view={view} summary={phase.summary} winner={phase.kind === 'gameOver' ? phase.winner : null} can={can} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-rows-[auto_1fr] gap-1 px-2">
          <div className="flex justify-center">{at('top')}</div>
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-1 min-h-0">
            <div>{at('left', 'left')}</div>
            <div className="h-full min-h-0 flex items-center justify-center py-1">
              <Centre view={view} />
            </div>
            <div>{at('right', 'right')}</div>
          </div>
        </div>
      )}

      <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
        {coached && <CoachStrip lessons={NO_LESSONS} />}
        {!watching && phase.kind !== 'roundResult' && phase.kind !== 'gameOver' && <Mine view={view} turn={myTurn} />}
        <div className="flex items-center justify-center gap-2 px-3 min-h-7" aria-live="polite">
          {!coached && (
            <span className={`text-center ${line?.mine ? 'text-accent font-semibold' : ''}`}>{watching ? 'You are watching this game.' : line?.text}</span>
          )}
        </div>
        {can.reclaimSeat && <TakeOver />}
        {watching ? (
          <div className="flex justify-center pb-3">
            <HeartsSeat view={view} seat={0} />
          </div>
        ) : (
          <>
            <Hand
              cards={hand}
              playable={myTurn}
              legal={can.legal}
              // A rule-breaking card asks for a second tap, but only where the table would take it: never at the opening lead.
              anyway={can.play.length > can.legal.length}
              dealFrom={dealFrom}
              onPlay={(card) => send({ type: 'playCard', card })}
              suggested={advised?.type === 'playCard' ? advised.card : null}
              explain={coached ? (card) => coached.coach.check({ type: 'playCard', card })?.body ?? null : undefined}
              most={HAND_SIZE}
              choose={
                phase.kind === 'passing'
                  ? { picked: phase.choice ?? picked, onPick: can.pass.length > 0 ? (card) => setPicked((p) => togglePick(p, card, PASS_SIZE)) : null }
                  : undefined
              }
              marked={playing ? newCards(playing) : []}
            />
            <ActionBar view={view} can={can} picked={picked} onSheet={setSheet} />
          </>
        )}
      </div>

      {sheet === 'menu' && (
        <Sheet title="Menu" onClose={() => setSheet(null)}>
          <MenuSheet view={view} room={room} onSheet={setSheet} />
        </Sheet>
      )}
      {sheet === 'rules' && <RulesSheet game={game} rules={view.rules} onClose={() => setSheet(null)} />}
      {sheet === 'history' && (
        <Sheet title="Last trick" onClose={() => setSheet(null)}>
          <LastTrick view={view} playing={playing} />
        </Sheet>
      )}
      {sheet === 'challenge' && (
        <AccuseSheet
          title="Challenge for 26 points"
          risk="Every card they have played this round is checked. If one broke a rule, they take 26 points; if none did, you take 26. Either way the round ends now and nobody else scores."
          accusations={can.challengePlay.map((seat) => ({
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

// ── Seats ────────────────────────────────────────────────────────────────

/** A seat's points this round and in all. */
function Points({ view, seat, row = false }: { view: View; seat: Seat; row?: boolean }) {
  return (
    <p className={`text-muted tabular-nums ${row ? 'flex gap-3' : 'grid justify-items-center text-xs'}`}>
      <span>
        <b className="text-ink">{points(takenThisRound(view)[seat])}</b> this round
      </span>
      <span>
        <b className="text-ink">{points(view.scores[seat])}</b> total
      </span>
    </p>
  )
}

/** Another player: whether they have chosen their pass, and their points. */
function HeartsSeat({ view, seat, side }: { view: View; seat: Seat; side?: 'left' | 'right' }) {
  const phase = view.phase
  const count = 'handCounts' in phase ? phase.handCounts[seat] : 0
  return (
    <SeatBadge view={view} seat={seat} side={side} turn={phase.kind === 'playing' && phase.turn === seat} count={count}>
      {phase.kind === 'passing' && phase.chosen.includes(seat) && <span className="role-badge">Ready</span>}
      <Points view={view} seat={seat} />
    </SeatBadge>
  )
}

/** The viewer's own line over the hand. */
function Mine({ view, turn }: { view: View; turn: boolean }) {
  return (
    <div className="flex items-center justify-center gap-3 px-3 text-sm">
      <span className="seat-name" data-turn={turn}>
        You
      </span>
      <Points view={view} seat={view.seat!} row />
    </div>
  )
}

// ── Centre of the table ──────────────────────────────────────────────────

function Centre({ view }: { view: View }) {
  const phase = view.phase
  if (phase.kind === 'passing') return <PassPanel view={view} phase={phase} />
  if (phase.kind === 'playing' || phase.kind === 'trickPause') return <TrickMiddle view={view} phase={phase} />
  return null
}

function PassPanel({ view, phase }: { view: View; phase: Extract<ViewPhase, { kind: 'passing' }> }) {
  const way = view.direction
  if (way === 'none') return null
  const to = view.seat === null ? null : passTarget(view.seat, way)
  return (
    <section className="panel p-3 w-full max-w-xs grid gap-2 text-center">
      <h2 className="display text-lg">Passing {way}</h2>
      <p>{PASS_RULE[way]}</p>
      {phase.choice && to !== null && <p className="text-on-surface-muted">Your three cards are ready for {seatName(view, to)}.</p>}
    </section>
  )
}

/** The trick, with who takes it and what it is worth, and under it the round's pass and whether hearts are broken. */
function TrickMiddle({ view, phase }: { view: View; phase: ViewPlaying }) {
  const last = phase.tricks[phase.tricks.length - 1]
  return (
    <div className="flex flex-col items-center gap-3">
      {/* Who takes the trick, with its points, is too long for the space between the cards: it goes under them, clear of the cards that overhang the area. */}
      <TrickArea view={view} phase={phase} wins={() => null} />
      <p className="mt-3 text-sm text-accent min-h-6 text-center" aria-live="polite">
        {phase.kind === 'trickPause' && last ? trickTaken(view, last.winner, last.plays.map((p) => p.card)) : ''}
      </p>
      <ul className="flex flex-wrap justify-center gap-x-2 gap-y-1 text-sm">
        <li className="fact">{passedWay(view.direction)}</li>
        <li className="fact" data-on={phase.heartsBroken}>
          Hearts {phase.heartsBroken ? 'broken' : 'not broken'}
          <span className="suit-chip" data-red="true" aria-hidden>
            ♥
          </span>
        </li>
      </ul>
    </div>
  )
}

// ── Actions and the menu ─────────────────────────────────────────────────

/** Under the hand: the pass while choosing; in play, the last trick and the challenge (absent with cheating off). */
function ActionBar({ view, can, picked, onSheet }: { view: View; can: Available; picked: Card[]; onSheet: (s: SheetName) => void }) {
  const { send } = useSession()
  const phase = view.phase
  if (phase.kind === 'passing' && can.pass.length > 0 && view.direction !== 'none') {
    const ready = picked.length === PASS_SIZE
    return (
      <div className="flex justify-center px-2 pb-2 min-h-12">
        <button className={`btn btn-primary ${ready ? 'attention' : ''}`} disabled={!ready} onClick={() => send({ type: 'choosePass', cards: picked })}>
          {passButton(view.direction)}
        </button>
      </div>
    )
  }
  if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return <div className="h-12" />
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 px-2 pb-2 min-h-12">
      <button className="btn btn-quiet btn-small" disabled={phase.tricks.length === 0} onClick={() => onSheet('history')}>
        Last trick
      </button>
      {view.rules.allowCheating && (
        <button className="btn btn-quiet btn-small" disabled={can.challengePlay.length === 0} onClick={() => onSheet('challenge')}>
          Challenge
        </button>
      )}
    </div>
  )
}

function MenuSheet({ view, room, onSheet }: { view: View; room: string; onSheet: (s: SheetName) => void }) {
  const coached = useCoach()
  const game = useGameClient()
  return (
    <GameMenu
      view={view}
      intro={
        <>
          <p className="text-on-surface-muted">
            {coached ? 'Practice game' : `Game ${room}`}, round {view.roundNumber}. {rulesSummary(game, view.rules)}.
          </p>
          {coached && (
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-small"
                onClick={() => {
                  coached.coach.restart(view.playerCount)
                  onSheet(null)
                }}
              >
                New practice game
              </button>
            </div>
          )}
        </>
      }
      actions={
        <>
          <button className="btn btn-small" onClick={() => onSheet('rules')}>
            Rules in this game
          </button>
          <button className="btn btn-small" onClick={() => onSheet('history')}>
            Last trick
          </button>
        </>
      }
    />
  )
}
