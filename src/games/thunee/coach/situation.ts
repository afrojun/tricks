/** One or two sentences on what the player is deciding: what is at stake and who is winning. */
import { type View, type ViewPlaying, SUIT_NAME, availableActions, teamOf, trickWinner } from '../engine'
import type { Note } from './note'
import { reads, trickPoints } from './reads'
import { highestTrump } from './check'
import { card, isPartner, partnerName, suitPlural, trickLabel, who } from './words'

export function situation(view: View): Note | null {
  const me = view.seat
  if (me === null) return null
  const phase = view.phase
  const can = availableActions(view)
  const note = (body: string, topic?: Note['topic']): Note => ({ tone: 'info', title: 'Your move', body, topic })

  switch (phase.kind) {
    case 'calling': {
      if (can.calls.length === 0) return null
      const lead = phase.call
        ? `${who(view, phase.call.seat)} has called ${phase.call.amount}.`
        : `No one has called yet. If nobody does, ${who(view, phase.defaultTrumper)} chooses trump.`
      return note(`${lead} Call ${can.calls[0]} to choose trump yourself, or pass.`, 'calling')
    }
    case 'trumpSelection':
      if (phase.trumper !== me) return null
      return note('You choose trump: a suit among your four cards, or the last card you will be dealt.', 'trump')
    case 'thuneeWindow':
      if (!can.callThunee) return null
      return note('Everyone has six cards. Call Thunee only if you can win all six tricks yourself; otherwise pass.', 'thunee')
    case 'playing':
      return phase.turn === me ? playing(view, phase) : null
    case 'trickPause': {
      if (!can.pass) return null
      const leader = phase.tricks[phase.tricks.length - 1].winner
      return note(`Your side won the trick, and ${who(view, leader)} leads next once you are done. Call Jodhi if you hold the king and queen of one suit; otherwise play on.`, 'jodhi')
    }
    default:
      return null
  }
}

function playing(view: View, phase: ViewPlaying): Note {
  const me = view.seat!
  const trick = trickLabel(view.playerCount, phase.half, phase.tricks.filter((t) => t.half === phase.half).length)
  const parts: string[] = []
  if (phase.current.length === 0) {
    parts.push(`You lead ${trick}.`)
    if (phase.thunee?.caller === me) parts.push('In your Thunee, the first card you lead sets trump.')
    else if (phase.trump !== null) parts.push(`Trump is ${SUIT_NAME[phase.trump]}.`)
    const voids = reads(view).filter((r) => teamOf(r.seat) !== teamOf(me))
    if (voids.length > 0) parts.push(`${who(view, voids[0].seat)} has no ${suitPlural(voids[0].voidIn)}.`)
    return { tone: 'info', title: 'Your lead', body: parts.join(' ') }
  }

  const winner = trickWinner(phase.current, phase.trump)
  const winning = phase.current.find((p) => p.seat === winner)!.card
  const last = phase.current.length === view.playerCount - 1
  if (isPartner(view, winner)) parts.push(`${sentenceName(view, winner)} is winning with ${card(winning)}.`)
  else parts.push(`${who(view, winner)} is winning with ${card(winning)}.`)
  if (last) parts.push('You play last.')
  parts.push(`This trick is worth ${trickPoints(phase)} so far.`)
  const led = phase.current[0].card.suit
  if (phase.hand.some((c) => c.suit === led)) parts.push(`${SUIT_NAME[led]} were led and you have some, so you must follow.`)
  else {
    const top = highestTrump(phase)
    const under = top !== null && phase.hand.some((c) => c.suit === top.suit) && phase.hand.some((c) => c.suit !== top.suit)
    parts.push(`You have no ${suitPlural(led)}, so you may play anything${under ? ` except a trump lower than ${card(top)}` : ''}.`)
  }
  return { tone: 'info', title: 'Your turn', body: parts.join(' '), seats: [winner], cards: [winning], topic: 'following' }
}

function sentenceName(view: View, seat: number): string {
  const name = partnerName(view, seat)
  return name.charAt(0).toUpperCase() + name.slice(1)
}
