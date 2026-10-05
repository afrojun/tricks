/**
 * Warnings before a mistake. Only a fixed list of mistakes, and never the coach's own advice:
 * each judgement rule fires only when the player's move has the problem and the advised move does not.
 */
import { type Action, type Card, type View, type ViewPlaying, CALL_AMOUNTS, CARD_POINTS, SUIT_NAME, availableActions, hasCard, rankStrength, teamOf, trickWinner } from '../engine'
import { callLimit, chooseJodhi, decide } from '../ai/choose'
import { HONEST } from '../ai/mind'
import { wouldWin } from '../ai/read'
import { findProofs, inPlay } from '../ai/suspicion'
import type { Note, WarningRule } from './note'
import { card, isPartner, list, suitPlural, target, who } from './words'

/** `{ type: 'tick' }` stands for tapping Continue at the end of a trick. */
export function check(view: View, action: Action): Note | null {
  const me = view.seat
  if (me === null) return null
  const warn = (rule: WarningRule, title: string, body: string, extra: Partial<Note> = {}): Note => ({ tone: 'warn', rule, title, body, ...extra })

  switch (action.type) {
    case 'playCard': {
      const phase = view.phase
      if (phase.kind !== 'playing' || phase.turn !== me) return null
      return checkPlay(view, phase, action.card, warn)
    }
    case 'call': {
      if (view.phase.kind !== 'calling') return null
      const limit = callLimit(view.phase.hand)
      const firstAbove = CALL_AMOUNTS.find((a) => a > limit)
      if (firstAbove === undefined || action.amount <= firstAbove) return null
      return warn('overcall', 'That call is high for this hand', `Your four cards are worth calling up to ${limit || 'nothing'}. A call is added to the other side's points, so calling ${action.amount} makes their ${target(view)} much easier.`, { topic: 'calling' })
    }
    case 'callThunee': {
      if (view.phase.kind !== 'thuneeWindow' || decide(view, HONEST).reason.code !== 'thuneeUnsafe') return null
      return warn('thunee', 'Are you sure about Thunee?', `Thunee means winning all six tricks yourself, and your hand cannot promise that. ${thuneeRisk(view)}`, { topic: 'thunee' })
    }
    case 'tick': {
      const jodhi = chooseJodhi(view, HONEST)
      if (!jodhi || jodhi.type !== 'claimJodhi') return null
      return warn('jodhiUnclaimed', 'You can call Jodhi', `You hold the king and queen of ${suitPlural(jodhi.suit)}. Call it now: once the next card is led, the chance is gone.`, { topic: 'jodhi' })
    }
    case 'challengePlay':
    case 'challengeJodhi': {
      const proofs = findProofs(view)
      const proven = action.type === 'challengePlay' ? proofs.some((p) => p.claim === null && p.accused === action.seat) : proofs.some((p) => p.claim === action.claim)
      if (proven) return null
      const accused = action.type === 'challengePlay' ? action.seat : inPlay(view)?.jodhiClaims[action.claim]?.seat
      const name = accused === undefined ? 'them' : who(view, accused)
      return warn('challenge', 'Nothing proves that yet', `You have not seen ${name} break a rule. A wrong challenge gives the other side 4 balls.`, { topic: 'challenge' })
    }
    default:
      return null
  }
}

type Warn = (rule: WarningRule, title: string, body: string, extra?: Partial<Note>) => Note

function checkPlay(view: View, phase: ViewPlaying, played: Card, warn: Warn): Note | null {
  const me = view.seat!
  const can = availableActions(view)
  if (!hasCard(can.legal, played)) {
    const led = phase.current[0]?.card.suit
    const held = led ? phase.hand.filter((c) => c.suit === led) : []
    const top = highestTrump(phase)
    const why =
      held.length > 0
        ? `${SUIT_NAME[led!]} were led and you hold ${list(held.map(card))}, so you must follow suit.`
        : `You may not play a trump lower than ${top ? card(top) : 'the trump'} already in this trick while you hold cards of another suit.`
    return warn('illegal', 'That breaks the rules', `${why} If an opponent notices, they can challenge and win 4 balls.`, { cards: held, topic: 'following' })
  }
  if (phase.current.length === 0) return null

  const advised = decide(view, HONEST).action
  const advisedCard = advised.type === 'playCard' ? advised.card : null
  const winner = trickWinner(phase.current, phase.trump)

  // Taking the trick from a partner who already has it, when a card that stays under was legal.
  const overtakes = (c: Card) => isPartner(view, winner) && wouldWin(phase, me, c)
  if (overtakes(played) && advisedCard && !overtakes(advisedCard) && can.legal.some((c) => !overtakes(c))) {
    return warn(
      'overtakePartner',
      'Your partner already has this trick',
      `${who(view, winner)} is winning it. Playing ${card(played)} takes it from them and uses up a strong card your side could win another trick with.`,
      { cards: [played], seats: [winner] },
    )
  }

  // Giving 10 or more points to a trick the other side is winning, when a cheaper card was legal.
  const theirs = teamOf(winner) !== teamOf(me)
  const gives = (c: Card) => theirs && !wouldWin(phase, me, c) && CARD_POINTS[c.rank] >= 10
  if (gives(played) && advisedCard && !gives(advisedCard) && can.legal.some((c) => CARD_POINTS[c.rank] < CARD_POINTS[played.rank])) {
    return warn(
      'givePoints',
      'That gives them points',
      `${who(view, winner)} is winning this trick and ${card(played)} cannot beat it. If they keep this trick, they take its ${CARD_POINTS[played.rank]} points too. A cheaper card risks less.`,
      { cards: [played], seats: [winner] },
    )
  }
  return null
}

/** The highest trump already in the trick, if any. */
export function highestTrump(phase: ViewPlaying): Card | null {
  const trump = phase.trump
  if (trump === null) return null
  const trumps = phase.current.map((p) => p.card).filter((c) => c.suit === trump)
  return trumps.sort((a, b) => rankStrength(b.rank) - rankStrength(a.rank))[0] ?? null
}

/** What failing a Thunee costs: 4 balls, or 8 if the caller's partner takes a trick. */
export function thuneeRisk(view: View): string {
  return view.playerCount === 4
    ? 'If you lose a trick, the other side gets 4 balls, or 8 balls if your own partner is the one who takes it.'
    : 'If you lose a trick, the other side gets 4 balls.'
}

/** Why a card breaks the rules: not following suit, or playing under a trump. */
export function illegalKind(phase: ViewPlaying): 'follow' | 'undercut' {
  const led = phase.current[0]?.card.suit
  return led !== undefined && phase.hand.some((c) => c.suit === led) ? 'follow' : 'undercut'
}
