import { describe, expect, test } from 'vitest'
import { hasCard, sameCard } from '../../../kit/cards'
import { type Mind, type Persona, mindFor } from '../../../kit/mind'
import { explain } from '../../../kit/search/explain'
import { prepare } from '../../../kit/search/sample'
import { search } from '../../../kit/search/search'
import { same, seededRng } from '../../../kit/testing'
import { seatsToAct } from '../engine/apply'
import { availableActions } from '../engine/available'
import { MOON, SPREAD, VOID } from '../engine/deals'
import { checkInvariants } from '../engine/invariants'
import { PASS_SIZE, PLAYERS, type RuleOverrides } from '../engine/rules'
import { Table, card, cards, playOf } from '../engine/testing'
import { type Card, strength, trickPoints } from '../engine/cards'
import type { Game } from '../engine/types'
import { viewFor } from '../engine/view'
import { chooseAction, decide, passOrder } from './choose'
import { rebuild, value } from './imagine'
import { unseen, wouldWin } from './read'
import { candidates, decisionId, heartsSearch, knowledge, passCandidates, searchHearts } from './search'
import { checking, full } from './testing'

const where = (k: ReturnType<typeof knowledge>) => ({
  hard: k.hard.map((c) => c.why).sort(),
  soft: k.soft.map((c) => c.why).sort(),
})

describe('what a seat knows', () => {
  test('while passing: the other three hands, thirteen cards each, and nothing more', () => {
    const k = knowledge(full(new Table({}, 1).deal(VOID), 0))
    expect(k.hidden).toHaveLength(39)
    expect(k.sizes).toEqual([13, 13, 13])
    expect(where(k)).toEqual({ hard: [], soft: [] })
  })

  // Left pass: seat 0 gives 2d 3d 2s to seat 1. Seats 1 and 2 hold no clubs after it, and show it on the first trick.
  const passedLeft = (overrides: RuleOverrides = {}) =>
    new Table(overrides, 1).deal(VOID).pass(['2d 3d 2s', '4d 5d 6d', '9c 10c Jc', 'Qc Kc Ac']).play('2c 7d 8d 9c').endPause().play('10c')

  test('in play: the cards it passed are held by the receiver until played, for certain; shown voids are evidence', () => {
    const k = knowledge(full(passedLeft(), 0))
    expect(k.hidden).toHaveLength(35)
    expect(k.sizes).toEqual([12, 12, 11])
    expect(where(k)).toEqual({ hard: ['gave 2-diamonds', 'gave 2-spades', 'gave 3-diamonds'], soft: ['followSuit:1:0', 'followSuit:2:0'] })
    expect(k.hard.every((c) => c.kind === 'holds' && c.place === 0)).toBe(true)
  })

  test('before the first card, the seat to lead holds the two of clubs, for certain', () => {
    const k = knowledge(full(new Table({ passing: 'none' }).deal(VOID), 1))
    expect(k.hard).toMatchObject([{ kind: 'holds', place: 0, card: card('2c'), why: 'leads 2-clubs' }])
    expect(knowledge(full(new Table({ passing: 'none' }).deal(VOID).play('2c'), 1)).hard).toEqual([])
  })

  test('with cheating off a shown void is certain, so it is hard', () => {
    const k = knowledge(full(passedLeft({ allowCheating: false }), 0))
    expect(where(k)).toEqual({ hard: ['followSuit:1:0', 'followSuit:2:0', 'gave 2-diamonds', 'gave 2-spades', 'gave 3-diamonds'], soft: [] })
  })

  test('a seat whose later card shows a void false is a cheat: none of its evidence is kept', () => {
    // Seat 2 throws 8d on a club lead while holding 10c and Jc, then plays 10c.
    const t = new Table({ passing: 'none' }).deal(VOID).play('2c 4d 9c Ac  Qc 3c 5d 8d').endPause().play('Kc 4c 6d 10c').endPause().play('Qd')
    expect(playOf(t.game).tricks[1].plays[3].broke).toEqual(['followSuit'])
    const k = knowledge(full(t, 0))
    expect(where(k).soft).toEqual(['followSuit:1:0', 'followSuit:1:1', 'followSuit:1:2'])
  })

  test('so is a seat that shows out of a suit it was passed and still holds', () => {
    // Seat 0 passes 5c 6c 7c to seat 1, which throws 7d on the opening club lead.
    const t = new Table({}, 1).deal(VOID).pass(['5c 6c 7c', '4d 5d 6d', '9c 10c Jc', 'Qc Kc Ac']).play('2c 7d 8d 9c').endPause().play('10c')
    expect(playOf(t.game).tricks[0].plays[1].broke).toEqual(['followSuit'])
    expect(where(knowledge(full(t, 0)))).toEqual({ hard: ['gave 5-clubs', 'gave 6-clubs', 'gave 7-clubs'], soft: ['followSuit:2:0'] })
  })

  test('a view without full memory cannot be searched', () => {
    const t = new Table({ passing: 'none' }).deal(VOID).play('2c 4d 9c Ac  Qc 3c 5d 10c').endPause()
    expect(() => knowledge(viewFor(t.game, 1))).toThrow(/full view/)
  })
})

/** Whole rounds of the hand-written player, Sly and Wild among them, calling `at` at every state. */
function eachState(overrides: RuleOverrides, seed: number, at: (t: Table) => void) {
  const personas: Persona[] = ['straight', 'sly', 'straight', 'wild']
  const t = new Table(overrides, seed).do(0, { type: 'start' })
  const seats = personas.map((persona) => ({ persona, standIn: false }))
  const mind = (seat: number): Mind => mindFor({ seats, aiSalt: t.game.aiSalt, rules: t.game.rules }, seat)
  for (let rounds = 0; rounds < 3 && t.game.phase.kind !== 'gameOver'; ) {
    const phase = t.game.phase
    if (phase.kind === 'roundResult') {
      rounds++
      t.do(0, { type: 'nextRound' })
      continue
    }
    at(t)
    if (phase.kind === 'trickPause') t.endPause()
    else {
      const seat = seatsToAct(t.game)[0]
      t.do(seat, chooseAction(full(t, seat), mind(seat))!)
    }
  }
}

describe('a game rebuilt from a view and a sampled world', () => {
  const RULES: [string, RuleOverrides][] = [
    ['Standard', {}],
    ['cheating off', { allowCheating: false }],
    ['the jack of diamonds, queen breaks hearts', { jackOfDiamonds: true, queenBreaksHearts: true }],
    ['points on the first trick, no passing', { pointsOnFirstTrick: true, passing: 'none' }],
  ]

  test.each(RULES)('%s: passes the invariants and gives the seat its own view back, in every state of seeded rounds with cheats', (_, overrides) => {
    let worlds = 0
    for (const seed of [1, 2]) {
      eachState(overrides, seed, (t) => {
        for (let seat = 0; seat < PLAYERS; seat++) {
          const view = full(t, seat)
          const sampler = prepare(knowledge(view))
          const rng = seededRng(seed * 10 + seat)
          for (let i = 0; i < 2; i++) {
            const game = rebuild(view, sampler.sample(rng))
            checkInvariants(game)
            if (!same(viewFor(game, seat, 'full'), view)) throw new Error(`seed ${seed}: seat ${seat} gets another view back`)
            worlds++
          }
        }
      })
    }
    expect(worlds).toBeGreaterThan(1000)
  })

  test('from the true deal, it records what each play broke exactly as the engine did', () => {
    let plays = 0
    eachState({}, 3, (t) => {
      const phase = t.game.phase
      if (phase.kind !== 'playing') return
      const view = full(t, 0)
      const truth = [1, 2, 3].map((s) => phase.play.hands[s])
      const play = playOf(rebuild(view, truth))
      const records = [...play.tricks.flatMap((x) => x.plays), ...play.current]
      const real = [...phase.play.tricks.flatMap((x) => x.plays), ...phase.play.current]
      expect(records.map((r) => r.broke)).toEqual(real.map((r) => r.broke))
      records.forEach((r, i) => expect(r.handBefore.every((c) => hasCard(real[i].handBefore, c)) && r.handBefore.length === real[i].handBefore.length).toBe(true))
      plays += records.length
    })
    expect(plays).toBeGreaterThan(1000)
  })
})

describe('candidates', () => {
  test('the passes: the hand-written player’s, then swaps of one of its cards for the next in its order, eight in all', () => {
    const view = full(new Table({}, 1).deal(SPREAD), 0)
    const hand = availableActions(view).pass
    const order = passOrder(view, hand)
    expect(order.slice(0, PASS_SIZE)).toEqual((decide(view, { persona: 'straight', salt: 0 })!.action as { cards: Card[] }).cards)
    expect([...order].sort((a, b) => `${a.suit}${a.rank}`.localeCompare(`${b.suit}${b.rank}`))).toEqual([...hand].sort((a, b) => `${a.suit}${a.rank}`.localeCompare(`${b.suit}${b.rank}`)))
    const passes = passCandidates(view, hand)
    expect(passes).toHaveLength(8)
    const [p1, p2, p3, r4, r5, r6] = order
    expect(passes).toEqual([
      [p1, p2, p3],
      [p1, p2, r4],
      [p1, r4, p3],
      [r4, p2, p3],
      [p1, p2, r5],
      [p1, r5, p3],
      [r5, p2, p3],
      [p1, p2, r6],
    ])
    expect(candidates(view)).toEqual(passes.map((cards) => ({ type: 'choosePass', cards })))
  })

  test('in play: the legal cards, the hand-written player’s first, one of each set that plays alike', () => {
    // Seat 1 follows the two of clubs holding 3c, 7c and Jc: cards still out lie between each.
    const t = new Table({ passing: 'none' }).deal(SPREAD).play('2c')
    expect(candidates(full(t, 1)).map((a) => (a as { card: Card }).card)).toEqual(cards('Jc 3c 7c'))
    // Seat 2 then holds 4c 8c Qc, but at VOID's opening, seat 2 holds 9c 10c Jc in a row: one card stands for all three.
    const v = new Table({ passing: 'none' }).deal(VOID).play('2c 4d')
    expect(candidates(full(v, 2))).toEqual([{ type: 'playCard', card: card('Jc') }])
  })

  test('a card on the table between two held cards keeps them apart: one wins the trick, the other does not', () => {
    // Seat 2 holds 7c and 9c and no other club; 8c lies on the table between them, so 7c loses the trick and 9c wins it.
    const deal = [
      '2c 3c 4c 5c 6c 2d 3d 4d 5d 6d 7d 8d 9d',
      '8c 10d Jd Qd Kd Ad 2s 3s 4s 5s 6s 7s 8s',
      '7c 9c 9s 10s Js Qs Ks As 2h 3h 4h 5h 6h',
      '10c Jc Qc Kc Ac 7h 8h 9h 10h Jh Qh Kh Ah',
    ]
    const t = new Table({ passing: 'none' }).deal(deal).play('2c 8c')
    const offered = candidates(full(t, 2)).map((a) => (a as { card: Card }).card)
    expect(offered).toEqual(cards('9c 7c'))
    const result = searchHearts(full(t, 2), { persona: 'straight', salt: 1 }, { worlds: 6 })!
    // 7c never takes the trick; 9c does unless seat 3, still to play, holds a higher club in that world.
    const [nine, seven] = result.options.map((o) => o.won!)
    expect(seven).toBe(0)
    expect(nine).toBeGreaterThan(0)
  })

  test('cards searched once for all play alike: none of those left out differs in suit, worth, or what it does to the trick', () => {
    let merged = 0
    for (const seed of [1, 2, 3]) {
      eachState({}, seed, (t) => {
        const phase = t.game.phase
        if (phase.kind !== 'playing') return
        const view = full(t, phase.turn)
        if (view.phase.kind !== 'playing') return
        const offered = candidates(view).map((a) => (a as { card: Card }).card)
        const meets = [...unseen(view.phase), ...view.phase.current.map((p) => p.card)]
        for (const c of availableActions(view).legal) {
          if (hasCard(offered, c)) continue
          merged++
          const stand = offered.find(
            (k) =>
              k.suit === c.suit &&
              trickPoints([k], view.rules) === trickPoints([c], view.rules) &&
              !meets.some((o) => o.suit === c.suit && strength(o) > Math.min(strength(k), strength(c)) && strength(o) < Math.max(strength(k), strength(c))),
          )
          expect(stand, `${c.rank}${c.suit} has no card standing for it`).toBeDefined()
          expect(wouldWin(view.phase.current, phase.turn, stand!)).toBe(wouldWin(view.phase.current, phase.turn, c))
        }
      })
    }
    expect(merged).toBeGreaterThan(100)
  })

  test('alike needs the same worth: the queen of spades never stands for the king, nor two hearts for a spade', () => {
    // Seat 1 is void in clubs after trick 0 at VOID; it discards on a club lead, holding 4s 5s 6s 7s Qs and 4h to 7h.
    const t = new Table({ passing: 'none', pointsOnFirstTrick: true }).deal(VOID).play('2c')
    const offered = candidates(full(t, 1)).map((a) => (a as { card: Card }).card)
    const legal = availableActions(full(t, 1)).legal
    expect(offered.every((c) => hasCard(legal, c))).toBe(true)
    expect(offered.filter((c) => c.suit === 'spades').map((c) => c.rank).sort()).toEqual(['4', 'Q'])
    expect(offered.filter((c) => c.suit === 'hearts')).toHaveLength(1)
    expect(offered.filter((c) => c.suit === 'diamonds')).toHaveLength(1)
    expect(sameCard(offered[0], decide(full(t, 1), { persona: 'straight', salt: 0 })!.action.type === 'playCard' ? (decide(full(t, 1), { persona: 'straight', salt: 0 })!.action as { card: Card }).card : card('2c'))).toBe(true)
  })
})

describe('decisions and values', () => {
  test('a decision is named by the round, then the pass or the trick and the cards on the table', () => {
    expect(decisionId(full(new Table({}, 1).deal(VOID), 2))).toBe('1:pass')
    const t = new Table({ passing: 'none' }).deal(VOID).play('2c 4d 9c Ac  Qc')
    expect(decisionId(full(t, 0))).toBe('1:1:Q-clubs')
  })

  test('a round’s value is the negative of the seat’s points, a moon scored as the rules say', () => {
    const others = new Table({ passing: 'none' }).deal(MOON).autoPlay('roundResult').game
    expect([0, 1, 2, 3].map((s) => value(others, s))).toEqual([-0, -26, -26, -26])
    const subtracts = new Table({ passing: 'none', moon: 'shooterSubtracts' }).deal(MOON).autoPlay('roundResult').game
    expect([0, 1, 2, 3].map((s) => value(subtracts, s))).toEqual([26, -0, -0, -0])
    expect(() => value(new Table({ passing: 'none' }).deal(MOON).game, 0)).toThrow(/not over/)
  })
})

describe('the search player for Hearts', () => {
  const mind = (salt: number): Mind => ({ persona: 'straight', salt })

  test('decides from the view alone: two games that look the same to a seat give it the same decision', () => {
    const passing = new Table({}, 1).deal(SPREAD)
    const swapped = structuredClone(passing.game)
    if (swapped.phase.kind !== 'passing') throw new Error('expected passing')
    ;[swapped.phase.hands[1][0], swapped.phase.hands[2][0]] = [swapped.phase.hands[2][0], swapped.phase.hands[1][0]]
    expect(same(viewFor(swapped, 0, 'full'), full(passing, 0))).toBe(true)
    expect(search(checking(), viewFor(swapped, 0, 'full'), mind(5))).toEqual(search(checking(), full(passing, 0), mind(5)))

    const play = new Table({ passing: 'none' }).deal(SPREAD).play('2c 3c 4c 5c  Kc 6c 7c 8c').endPause().play('9c')
    const other = structuredClone(play.game)
    const hands = playOf(other).hands
    ;[hands[2][0], hands[3][0]] = [hands[3][0], hands[2][0]]
    expect(same(viewFor(other, 0, 'full'), full(play, 0))).toBe(true)
    const seen = search(checking(), full(play, 0), mind(5))
    expect(seen?.worlds).toBe(heartsSearch.worlds)
    expect(search(checking(), viewFor(other, 0, 'full'), mind(5))).toEqual(seen)
  })

  test('the same view and mind give the same decision, after a save and reload too; another salt may differ', () => {
    const t = new Table({ passing: 'none' }).deal(SPREAD).play('2c 3c 4c 5c  Kc 6c 7c 8c').endPause().play('9c')
    const once = searchHearts(full(t, 0), mind(9))!
    expect(searchHearts(full(t, 0), mind(9))).toEqual(once)
    const reloaded: Game = JSON.parse(JSON.stringify(t.game))
    expect(searchHearts(viewFor(reloaded, 0, 'full'), mind(9))).toEqual(once)
    const values = (salt: number) => JSON.stringify(searchHearts(full(t, 0), mind(salt))!.options.map((o) => o.values))
    expect(new Set([1, 2, 3, 4].map(values)).size).toBeGreaterThan(1)
  })

  test('explains a decision: each option’s mean points against, and for a card how often it won the trick', () => {
    const t = new Table({ passing: 'none' }).deal(SPREAD).play('2c 3c 4c 5c  Kc 6c 7c 8c').endPause().play('9c')
    const card = explain(searchHearts(full(t, 0), mind(9), { worlds: 6 })!)!
    expect(card.worlds).toBe(6)
    expect(card.chosen.gap).toBe(0)
    expect([card.chosen, ...card.others].every((e) => e.mean <= 0 && e.wins !== null && e.wins >= 0 && e.wins <= 1)).toBe(true)
    const pass = explain(searchHearts(full(new Table({}, 1).deal(SPREAD), 0), mind(9), { worlds: 6 })!)!
    expect(pass.others).toHaveLength(7)
    expect([pass.chosen, ...pass.others].every((e) => e.wins === null)).toBe(true)
  })

  test('only one candidate is played without a search', () => {
    const t = new Table({ passing: 'none' }).deal(VOID)
    expect(searchHearts(full(t, 0), mind(1))).toMatchObject({ action: { type: 'playCard', card: card('2c') }, worlds: 0 })
    expect(searchHearts(full(t, 1), mind(1))).toBeNull()
  })

  test('holding back narrows the cards it may play', () => {
    const t = new Table({ passing: 'none' }).deal(SPREAD).play('2c')
    const among = cards('3c 7c')
    const result = searchHearts(full(t, 1), mind(1), { among, worlds: 4 })!
    expect(result.options.map((o) => (o.action as { card: Card }).card)).toEqual(expect.arrayContaining(among))
    expect(result.options).toHaveLength(2)
  })
})
