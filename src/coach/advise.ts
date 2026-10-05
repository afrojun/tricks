/** The suggested move for the player's decision, and why: the honest computer's choice, put into words. */
import { type Action, type Card, type View, type ViewPlaying, SUIT_NAME, availableActions, jodhiPoints, sameCard } from '../engine'
import { decide, chooseJodhi } from '../ai/choose'
import { HONEST } from '../ai/mind'
import { wouldWin } from '../ai/read'
import type { Reason } from '../ai/reasons'
import { findProofs, inPlay } from '../ai/suspicion'
import type { Note } from './note'
import { card, count, isPartner, list, points, suitPlural, who } from './words'

export interface Advice {
  note: Note
  action: Action
}

/** Null when the player has nothing to decide. */
export function advise(view: View): Advice | null {
  const me = view.seat
  if (me === null) return null
  const can = availableActions(view)
  const phase = view.phase

  const challenge = provableChallenge(view)
  if (challenge) return challenge

  const jodhi = chooseJodhi(view, HONEST)
  if (jodhi && jodhi.type === 'claimJodhi') {
    const trump = inPlay(view)?.trump ?? null
    const pts = jodhiPoints(jodhi.suit, jodhi.withJack, trump)
    return {
      action: jodhi,
      note: {
        tone: 'suggest',
        title: 'Call Jodhi',
        body: `You hold the king and queen of ${suitPlural(jodhi.suit)}${jodhi.withJack ? ' and the jack' : ''}, and your side has just won a trick. Calling it adds ${pts} to your side.`,
        topic: 'jodhi',
      },
    }
  }

  const decides =
    can.calls.length > 0 || can.chooseTrump.length > 0 || can.callThunee || (phase.kind === 'thuneeWindow' && can.pass) ||
    (phase.kind === 'playing' && phase.turn === me)
  if (!decides) return null

  const { action, reason } = decide(view, HONEST)
  return { action, note: { tone: 'suggest', title: titleOf(action), body: explain(view, action, reason), cards: cardsOf(action, reason), topic: topicOf(reason) } }
}

function titleOf(action: Action): string {
  switch (action.type) {
    case 'call':
      return `Call ${action.amount}`
    case 'pass':
      return 'Pass'
    case 'chooseTrump':
      return action.choice === 'lastCard' ? 'Choose last card' : `Choose ${SUIT_NAME[action.choice]}`
    case 'callThunee':
      return 'Call Thunee'
    case 'playCard':
      return `Play ${card(action.card)}`
    case 'callDouble':
      return 'Call Double'
    case 'callKhanaak':
      return 'Call Khanaak'
    default:
      return 'Hint'
  }
}

function cardsOf(action: Action, reason: Reason): Card[] | undefined {
  if (action.type === 'playCard') return [action.card]
  if (reason.code === 'strongestSuit') return reason.cards
  return undefined
}

function topicOf(reason: Reason): Note['topic'] {
  switch (reason.code) {
    case 'callStrong':
    case 'passWeak':
      return 'calling'
    case 'strongestSuit':
    case 'lastCard':
      return 'trump'
    case 'thuneeSure':
    case 'thuneeUnsafe':
    case 'thuneeLeadHigh':
      return 'thunee'
    case 'sureDouble':
      return 'double'
    case 'sureKhanaak':
      return 'khanaak'
    default:
      return 'following'
  }
}

function strength(r: { jacks: number; backedJack: boolean; high: number }): string {
  if (r.jacks >= 2) return `${count(r.jacks, 'jack')}`
  if (r.backedJack) return 'a jack with another high card of its suit'
  if (r.jacks === 1) return 'one jack without support'
  return r.high > 0 ? `no jacks and ${count(r.high, 'high card')}` : 'no jacks or high cards'
}

function explain(view: View, action: Action, reason: Reason): string {
  const phase = inPlay(view)
  if (action.type === 'playCard' && availableActions(view).legal.length === 1 && view.phase.kind === 'playing' && view.phase.hand.length === 1) {
    return `${card(action.card)} is your only card.`
  }
  switch (reason.code) {
    case 'callStrong':
      return `Your four cards hold ${strength(reason)}: strong enough to choose trump. A call is added to the other side's points, so this hand is worth calling up to ${reason.limit}.`
    case 'passWeak':
      return `Your four cards hold ${strength(reason)}. That is not strong enough to call: a call is added to the other side's points.`
    case 'strongestSuit':
      return `You hold ${list(reason.cards.map(card))} in ${suitPlural(reason.suit)}, more strength than in any other suit. The more good trumps you hold, the more tricks you can take.`
    case 'lastCard':
      return 'None of your suits is strong enough to rely on, so let the last card you are dealt decide trump.'
    case 'thuneeSure':
      return `With your ${suitPlural(reason.suit)} you can win every trick. Thunee is worth 4 balls.`
    case 'thuneeUnsafe':
      return 'Thunee means winning all six tricks yourself. Your hand cannot promise that, and failing gives the other side 4 balls.'
    case 'leadBoss':
      return `The jack is the highest card of its suit, so only a trump can beat ${card(reason.card)}.${whyNot(view, phase, reason.card)}`
    case 'leadLow':
      return `${card(reason.card)} is your cheapest card outside trump. Keep stronger cards for tricks you can win.`
    case 'leadTrump':
      return 'You hold only trumps, so lead your strongest.'
    case 'thuneeLeadHigh':
      return 'In a Thunee you must win every trick, so lead your strongest card.'
    case 'feedPartner':
      return `${partnerText(view, phase)} already has this trick and you play last, so give them your most valuable card: ${card(reason.card)} is worth ${points([reason.card])}.`
    case 'holdUnderPartner':
      return `${partnerText(view, phase)} is winning, but someone still plays after you. Keep your good cards and play your cheapest.`
    case 'cheapOvertake':
      return `${partnerText(view, phase)} is winning, and ${card(reason.card)}, your cheapest card, beats them. That is fine: the trick stays with your side.`
    case 'cheapestWinner': {
      const led = phase?.current[0]?.card.suit
      const trumping = phase !== null && phase.trump !== null && reason.card.suit === phase.trump && led !== phase.trump
      const lead = trumping ? `You have no ${suitPlural(led!)}, so a trump takes this trick: ${card(reason.card)} is the cheapest one that wins.` : `${card(reason.card)} is the cheapest card that wins this trick.`
      return `${lead}${whyNot(view, phase, reason.card)}`
    }
    case 'cannotWin':
      return 'None of your cards can win this trick, so give away as few points as possible.'
    case 'sureDouble':
      return 'Your side has won the first five tricks and your card wins the last. Double is worth 2 balls.'
    case 'sureKhanaak':
      return 'Your Jodhi plus 10 beats everything the other side has, and your card wins the last trick.'
    case 'fallback':
      return action.type === 'playCard' ? `${card(action.card)} is a safe card to play.` : 'This is the safe choice.'
  }
}

function partnerText(view: View, phase: ViewPlaying | null): string {
  if (phase === null || phase.current.length === 0) return 'Your partner'
  const partner = phase.current.map((p) => p.seat).find((s) => isPartner(view, s))
  return partner === undefined ? 'Your partner' : who(view, partner) === 'Partner' ? 'Partner' : `Your partner ${who(view, partner)}`
}

/** One sentence on the other cards that would also win, when there are some. */
function whyNot(view: View, phase: ViewPlaying | null, chosen: Card): string {
  if (phase === null || view.seat === null || phase.current.length === 0) return ''
  const others = availableActions(view).legal.filter((c) => !sameCard(c, chosen) && wouldWin(phase, view.seat!, c))
  if (others.length === 0) return ''
  return ` ${list(others.map(card))} would also win, but ${others.length === 1 ? 'it is' : 'they are'} worth keeping for later.`
}

function provableChallenge(view: View): Advice | null {
  const can = availableActions(view)
  for (const proof of findProofs(view)) {
    const action: Action | null =
      proof.claim !== null
        ? can.challengeJodhi.includes(proof.claim) ? { type: 'challengeJodhi', claim: proof.claim } : null
        : can.challengePlay.includes(proof.accused) ? { type: 'challengePlay', seat: proof.accused } : null
    if (!action) continue
    return { action, note: { tone: 'suggest', title: `Challenge ${who(view, proof.accused)}`, body: proofText(view, proof.id, proof.accused), seats: [proof.accused], topic: 'challenge' } }
  }
  return null
}

/** Proof ids: `renege:seat:trick:revealTrick`, `undercut:…`, `jodhi:claim:cardId`. */
function proofText(view: View, id: string, accused: number): string {
  const name = who(view, accused)
  const [kind, , cheatAt, revealAt] = id.split(':')
  const phase = inPlay(view)
  const trick = (i: string) => phase?.tricks[Number(i)] ?? (Number(i) === phase?.tricks.length ? { plays: phase.current } : null)
  const end = 'A correct challenge wins your side 4 balls.'
  if (kind === 'renege') {
    const led = trick(cheatAt)?.plays[0]?.card.suit
    if (led) return `On trick ${Number(cheatAt) + 1} ${name} did not follow ${suitPlural(led)}, but has since played one. ${end}`
  }
  if (kind === 'undercut') return `${name} played under a trump while holding another suit, which the rules forbid. ${end}`
  if (kind === 'jodhi') return `${name} called a Jodhi, but one of its cards is in your hand or has been played elsewhere. ${end}`
  void revealAt
  return `${name} has broken the rules. ${end}`
}
