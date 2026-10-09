import { useEffect, useState } from 'react'
import { type Available, type Card, HAND_SIZE, PASS_SIZE, type View, type ViewPhase, type ViewPlaying, availableActions, passTarget } from '../engine'
import type { Seat } from '../../../kit/table'
import { AccuseSheet } from '../../../ui/Accuse'
import { SuitChip } from '../../../ui/Card'
import { HowToPlaySheet } from '../../../ui/coach/CoachSheets'
import { CoachStrip } from '../../../ui/coach/CoachStrip'
import { GameMenu } from '../../../ui/GameMenu'
import { Hand } from '../../../ui/Hand'
import { NO_PICKS, type Picks, pickFrom, pickedFrom } from '../../../ui/hands'
import { RulesSheet, rulesSummary } from '../../../ui/Rules'
import { SeatBadge, TakeOver, usePosition } from '../../../ui/Seat'
import { Sheet } from '../../../ui/Sheet'
import { TalkMine } from '../../../ui/talk/Said'
import { TalkButton } from '../../../ui/talk/Tray'
import { LastTrick, NO_TRICK, TrickArea } from '../../../ui/Trick'
import { TOWARD, type Where } from '../../../ui/seats'
import { useGameClient } from '../../../ui/session'
import { seatName } from '../../../ui/text'
import { TOPICS } from '../coach/topics'
import { RoundResult } from './RoundResult'
import { useCoach, useSession } from './session'
import { hint, newCards, passButton, passedWay, points, sortHand, trickTaken } from './text'

type SheetName = 'menu' | 'history' | 'rules' | 'challenge' | 'howto' | null
type PassWay = Exclude<View['direction'], 'none'>

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
  const { send } = useSession()
  const game = useGameClient()
  const position = usePosition(view)
  const [sheet, setSheet] = useState<SheetName>(null)
  const me = view.seat ?? 0
  const watching = view.seat === null
  const phase = view.phase
  const can = availableActions(view)
  // The cards picked to pass, until they are sent. They belong to the hand they were picked from,
  // so a new deal or a new practice game starts a new choice.
  const [picks, setPicks] = useState<Picks<Card>>(NO_PICKS)
  const picked = pickedFrom(picks, can.pass)
  // No sound or buzz for the player's turn: no event marks it, and a view's change is not an event.
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
    <div className="h-[calc(100dvh-var(--update-h,0px))] flex flex-col overflow-hidden" data-felt-table>
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
        <div className="flex-1 min-h-0 grid grid-rows-[auto_1fr] grid-cols-[minmax(0,1fr)] gap-1 px-2">
          <div className="flex justify-center">{at('top')}</div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[minmax(0,1fr)] items-center gap-1 min-h-0">
            <div className="self-stretch min-h-0">{at('left', 'left')}</div>
            {/*
              The trick keeps one place all round, empty under the pass, so the rays behind it never move.
              A panel taller than a short screen's table scrolls, from its top.
            */}
            <div className="trick-stage relative h-full min-h-0 flex items-center justify-center py-1">
              <TrickMiddle view={view} playing={playing} />
              {phase.kind === 'passing' && (
                <div className="absolute inset-0 flex justify-center items-center-safe overflow-y-auto py-1">
                  <PassPanel view={view} phase={phase} />
                </div>
              )}
            </div>
            <div className="self-stretch min-h-0">{at('right', 'right')}</div>
          </div>
        </div>
      )}

      <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
        {coached && <CoachStrip lessons={TOPICS} />}
        {!watching && phase.kind !== 'roundResult' && phase.kind !== 'gameOver' && <Mine view={view} turn={myTurn} />}
        {/* Outside practice the hint can run to two lines: their room is kept, so the table does not move when it does. The talk button keeps the row's right end. */}
        <div className={`hint-row flex items-center justify-center gap-2 px-3 ${coached ? 'min-h-7' : 'min-h-[2.8rem]'}`} aria-live="polite">
          <TalkMine />
          {!coached && (
            <span className={`text-center ${line?.mine ? 'font-semibold' : ''}`}>{watching ? 'You are watching this game.' : line?.mine ? <Cued text={line.text} /> : line?.text}</span>
          )}
          <TalkButton />
        </div>
        {can.reclaimSeat && <TakeOver />}
        {watching ? (
          <div className="flex justify-center pb-3">
            <HeartsSeat view={view} seat={0} />
          </div>
        ) : phase.kind === 'roundResult' || phase.kind === 'gameOver' ? null : (
          // A round's result has the room: the hand, empty by then, keeps a card's height in play.
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
                  ? { picked: phase.choice ?? picked, onPick: can.pass.length > 0 ? (card) => setPicks((p) => pickFrom(p, can.pass, card, PASS_SIZE)) : null }
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

/** The player's own line, with its first sentence (such as "Your turn") on the yellow cue. */
function Cued({ text }: { text: string }) {
  const end = text.indexOf('. ')
  if (end === -1) return <b className="cue">{text}</b>
  return (
    <>
      <b className="cue">{text.slice(0, end)}</b> {text.slice(end + 2)}
    </>
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
    <SeatBadge
      view={view}
      seat={seat}
      side={side}
      turn={phase.kind === 'playing' && phase.turn === seat}
      count={count}
      tags={phase.kind === 'passing' && phase.chosen.includes(seat) && <span className="role-badge">Ready</span>}
    >
      <Points view={view} seat={seat} />
    </SeatBadge>
  )
}

/** The viewer's own line over the hand. */
function Mine({ view, turn }: { view: View; turn: boolean }) {
  return (
    <div className="flex items-center justify-center gap-3 px-3 text-sm">
      {/* Where a throw at the player lands. */}
      <span className="seat-name" data-turn={turn} data-seat-name={view.seat!}>
        You
      </span>
      <Points view={view} seat={view.seat!} row />
    </div>
  )
}

// ── Centre of the table ──────────────────────────────────────────────────

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

/**
 * The trick, with who takes it and what it is worth, and under it the round's pass and whether
 * hearts are broken. Out of play it keeps its place, empty, with the lines under it hidden.
 */
function TrickMiddle({ view, playing }: { view: View; playing: ViewPlaying | null }) {
  const last = playing?.tricks[playing.tricks.length - 1]
  return (
    <div className="flex flex-col items-center">
      <TrickArea view={view} phase={playing ?? NO_TRICK} wins={(winner) => (last ? trickTaken(view, winner, last.plays.map((p) => p.card)) : null)} />
      <ul className={`trick-below flex flex-wrap justify-center gap-x-2 gap-y-1 text-sm ${playing ? '' : 'invisible'}`}>
        <li className="fact">{passedWay(view.direction)}</li>
        <li className="fact" data-on={playing?.heartsBroken ?? false}>
          Hearts {playing?.heartsBroken ? 'broken' : 'not broken'}
          <SuitChip suit="hearts" />
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
      <div className="flex justify-center px-2 pb-2 min-h-13">
        <button className={`btn btn-primary ${ready ? 'attention' : ''}`} disabled={!ready} onClick={() => send({ type: 'choosePass', cards: picked })}>
          {passButton(view.direction)}
        </button>
      </div>
    )
  }
  if (phase.kind !== 'playing' && phase.kind !== 'trickPause') return <div className="h-13" />
  // As tall as the pass bar's full-size button, so the hand does not move when passing ends.
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 px-2 pb-2 min-h-13">
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

/** `onRestart`: a new practice game drops what was picked in the old one. */
function MenuSheet({ view, room, onSheet, onRestart }: { view: View; room: string; onSheet: (s: SheetName) => void; onRestart: () => void }) {
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
              <button className="btn btn-small" onClick={() => onSheet('howto')}>
                How to play
              </button>
              <button
                className="btn btn-small"
                onClick={() => {
                  onRestart()
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
