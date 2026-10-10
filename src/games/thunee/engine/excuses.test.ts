import { describe, expect, test } from 'vitest'
import { brokenRules } from '../../../kit/integrity'
import { availableActions } from './available'
import { hasCard } from './cards'
import { TRADITIONAL, resolveRules } from './rules'
import { Table, card, cards, seededRng } from './testing'
import { excusesFor, isLegalPlay, seenPlays } from './tricks'
import type { Game } from './types'
import { viewFor } from './view'

// Dealer 0: seat 1 is trumper (team 1), seat 2 leads. Teams: 0+2 count, 1+3 trump.
const D1 = ['Jh 9h Ks Qs 10c Qd', 'Js 9s As 10s Kd Qc', 'Jc 9c Ac Kc Ah 10h', 'Jd 9d Ad 10d Kh Qh']
// Seat 2 leads a diamond; seat 0 trumps with Ks; seat 1, holding clubs, undercuts with Qs.
const UNDERCUT = ['Ks Jh 9h Ah 10h Kh', 'Qs Js Jc 9c Ac 10s', 'Jd 9d Ad 10d Kd Qd', 'Qh Kc Qc 10c 9s As']
const start = (hands = D1) => new Table(4, { redealIfNoTrumps: false }).deal(hands).toPlay('spades')

const playOf = (game: Game) => {
  if (game.phase.kind !== 'playing' && game.phase.kind !== 'trickPause') throw new Error(game.phase.kind)
  return game.phase.play
}
const records = (game: Game) => [...playOf(game).tricks.flatMap((t) => t.plays), ...playOf(game).current]
const result = (game: Game) => {
  if (game.phase.kind !== 'roundResult' && game.phase.kind !== 'gameOver') throw new Error(game.phase.kind)
  return game.phase.summary
}
const rules = (excuses: { rule: string }[]) => excuses.map((e) => e.rule)

describe('excuses', () => {
  test('a card off the led suit needs the renege excuse; leading and following need none', () => {
    expect(excusesFor(card('9c'), [], 'spades', TRADITIONAL)).toEqual([])
    expect(excusesFor(card('Jh'), cards('Ah'), 'spades', TRADITIONAL)).toEqual([])
    const [renege] = excusesFor(card('9c'), cards('Ah'), 'spades', TRADITIONAL)
    expect(renege.rule).toBe('renege')
    expect(renege.without(card('Qh'))).toBe(true)
    expect(renege.without(card('Qc'))).toBe(false)
  })

  test('a trump under one already in a trick led in another suit needs the undercut excuse, only under that rule', () => {
    const trick = cards('Ah Js')
    expect(rules(excusesFor(card('Qs'), trick, 'spades', TRADITIONAL))).toEqual(['renege', 'undercut'])
    expect(rules(excusesFor(card('Qs'), trick, 'spades', resolveRules({ undercutRestriction: false })))).toEqual(['renege'])
    const undercut = excusesFor(card('Qs'), trick, 'spades', TRADITIONAL)[1]
    expect(undercut.without(card('9c'))).toBe(true)
    expect(undercut.without(card('Ks'))).toBe(false)
    // Overtrumping, trumping first, and following a trump lead need no undercut excuse.
    expect(rules(excusesFor(card('Js'), cards('Ah Qs'), 'spades', TRADITIONAL))).toEqual(['renege'])
    expect(rules(excusesFor(card('Qs'), cards('Ah Kh'), 'spades', TRADITIONAL))).toEqual(['renege'])
    expect(rules(excusesFor(card('Qs'), cards('Js'), 'spades', TRADITIONAL))).toEqual([])
    expect(rules(excusesFor(card('Qs'), trick, null, TRADITIONAL))).toEqual(['renege'])
  })

  test('a card is legal exactly when its hand shows none of its excuses false', () => {
    const trick = cards('Ah Js')
    for (const hand of ['Qs 9c', 'Qs Ks', 'Qs Kh', 'Qs 9c Kh', '9c Qd', 'Jh 9c']) {
      for (const c of cards(hand)) {
        const broke = brokenRules(cards(hand), excusesFor(c, trick, 'spades', TRADITIONAL))
        expect(isLegalPlay(c, cards(hand), trick, 'spades', TRADITIONAL)).toBe(broke.length === 0)
      }
    }
  })
})

describe('the record and the verdict', () => {
  test('each play records the rules it broke; a legal play records none', () => {
    const t = start().play('Jc Qh Jh') // seat 3 has no clubs; seat 0 holds the 10 of clubs
    expect(records(t.game).map((r) => r.broke)).toEqual([[], [], ['renege']])
    const u = start(UNDERCUT).play('Jd Qh Ks Qs')
    expect(records(u.game).map((r) => r.broke)).toEqual([[], [], [], ['undercut']])
  })

  test('the verdict names the first rule the accused broke', () => {
    const renege = start().play('Jc Qh Jh').do(1, { type: 'challengePlay', seat: 0 })
    expect(result(renege.game).challenge).toMatchObject({ guilty: true, rule: 'renege', card: card('Jh') })
    const undercut = start(UNDERCUT).play('Jd Qh Ks Qs').do(2, { type: 'challengePlay', seat: 1 })
    expect(result(undercut.game).challenge).toMatchObject({ guilty: true, rule: 'undercut', card: card('Qs') })
    const honest = start().play('Jc Qh').do(0, { type: 'challengePlay', seat: 3 })
    expect(result(honest.game).challenge).toMatchObject({ guilty: false, card: card('Qh') })
    expect(result(honest.game).challenge?.rule).toBeUndefined()
  })

  test('legality, the record and what an observer sees all come from the excuses', () => {
    for (const [players, overrides] of [[4, {}], [4, { undercutRestriction: false }], [2, {}]] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        const t = new Table(players, { redealIfNoTrumps: false, ...overrides }, seed).do(0, { type: 'start' })
        const chaos = seededRng(seed)
        t.advance(t.seconds('call') * 1000)
        const trumper = (t.game.phase as { trumper: number }).trumper
        t.do(trumper, { type: 'chooseTrump', choice: 'lastCard' })
        if (t.game.phase.kind === 'thuneeWindow') t.advance(t.seconds('thunee') * 1000)
        while (t.game.phase.kind === 'playing' || t.game.phase.kind === 'trickPause') {
          const phase = t.game.phase
          if (phase.kind === 'trickPause') {
            t.endPause()
            continue
          }
          const can = availableActions(viewFor(t.game, phase.turn))
          const pick = chaos() < 0.4 ? can.play : can.legal
          const c = pick[Math.floor(chaos() * pick.length)]
          t.do(phase.turn, { type: 'playCard', card: c })
          const record = records(t.game).at(-1)!
          expect(hasCard(can.legal, c)).toBe(record.broke.length === 0)
          const all = records(t.game)
          for (const seat of [0, 1, null]) {
            const seen = seenPlays(viewFor(t.game, seat, 'full'))
            expect(seen.map((p, i) => brokenRules(all[i].handBefore, p.excuses))).toEqual(all.map((r) => r.broke))
          }
        }
      }
    }
  })
})

describe('what an observer sees', () => {
  test('each play with its trick, its half and its excuses', () => {
    const t = start().play('Jc Qh Jh Qc').endPause().play('9c')
    const seen = seenPlays(viewFor(t.game, 1, 'full'))
    expect(seen.map((p) => [p.seat, p.trick, p.deal, rules(p.excuses)])).toEqual([
      [2, 0, 1, []],
      [3, 0, 1, ['renege']],
      [0, 0, 1, ['renege']],
      [1, 0, 1, []],
      [2, 1, 1, []],
    ])
  })

  test('a table view sees only the last completed trick and the current one', () => {
    const t = start().play('Jc Qh 10c Qc  9c Kh Qd 10s  Js 10h 10d Qs').endPause().play('9s')
    expect(seenPlays(viewFor(t.game, 0)).map((p) => p.trick)).toEqual([2, 2, 2, 2, 3])
    expect(seenPlays(viewFor(t.game, 0, 'full'))).toHaveLength(13)
    expect(seenPlays(viewFor(new Table().game, 0))).toEqual([])
  })
})
