/** A few sentences on what the player is deciding: what is at stake and who is winning. */
import { type View, type ViewPlaying, availableActions, teamOf, trickWinner } from '../engine'
import type { Note } from './note'
import { reads, trickPoints } from './reads'
import { highestTrump } from './check'
import { card, isPartner, partnerName, sentence, suitPlural, trickLabel, who, whoIn } from './words'

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
        : `Nobody has called yet. If nobody does, ${whoIn(view, phase.defaultTrumper)} ${phase.defaultTrumper === me ? 'choose' : 'chooses'} trump.`
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
      const won = view.playerCount === 2 ? 'You won the trick' : 'Your side won the trick'
      return note(`${won}, and ${whoIn(view, leader)} ${leader === me ? 'lead' : 'leads'} next once you are done. Call Jodhi if you hold the king and queen of one suit; otherwise press No Jodhi.`, 'jodhi')
    }
    default:
      return null
  }
}

/** Where the trick stands: up to three sentences, as a note that reports it may take. */
function playing(view: View, phase: ViewPlaying): Note {
  const me = view.seat!
  const trick = trickLabel(view.playerCount, phase.half, phase.tricks.filter((t) => t.half === phase.half).length)
  const parts: string[] = []
  if (phase.current.length === 0) {
    parts.push(`You lead ${trick}.`)
    if (phase.thunee?.caller === me) parts.push('In your Thunee, the first card you lead sets trump.')
    else if (phase.trump !== null) parts.push(`Trump is ${suitPlural(phase.trump)}.`)
    const voids = reads(view).filter((r) => teamOf(r.seat) !== teamOf(me))
    if (voids.length > 0) parts.push(`${who(view, voids[0].seat)} has no ${suitPlural(voids[0].voidIn)}.`)
    return { tone: 'info', title: 'Your lead', body: parts.join(' ') }
  }

  const winner = trickWinner(phase.current, phase.trump)
  const winning = phase.current.find((p) => p.seat === winner)!.card
  const last = phase.current.length === view.playerCount - 1
  const by = isPartner(view, winner) ? sentence(partnerName(view, winner)) : who(view, winner)
  parts.push(`${by} is winning with ${card(winning)}${last ? ', and you play last' : ''}.`)
  parts.push(`This trick holds ${trickPoints(phase)} points so far.`)
  const led = phase.current[0].card.suit
  if (phase.hand.some((c) => c.suit === led)) parts.push(`${sentence(suitPlural(led))} were led and you hold some, so you must follow.`)
  else {
    const top = highestTrump(phase)
    const under = top !== null && phase.hand.some((c) => c.suit === top.suit) && phase.hand.some((c) => c.suit !== top.suit)
    parts.push(`You hold no ${suitPlural(led)}, so you may play anything${under ? ` except a trump lower than ${card(top)}` : ''}.`)
  }
  return { tone: 'info', title: 'Your turn', body: parts.join(' '), seats: [winner], cards: [winning], topic: 'following' }
}
