import { type Card, type Suit, pointsOf } from './cards'
import { ballsTarget, winningTeam } from './predicates'
import { CHALLENGE_BALLS, FOUR_PLAYER_TARGET } from './rules'
import { type Seat, type Team, next, otherTeam, partnerOf, teamOf } from './seats'
import type { Game, GameEvent, RoundPlay, RoundSummary, ScoreLine } from './types'

export type Outcome =
  | { kind: 'normal' }
  | { kind: 'thunee'; success: boolean; partnerCatch: boolean }
  | { kind: 'double' }
  | { kind: 'khanaak' }
  | {
      kind: 'challenge'
      challenger: Seat
      accused: Seat
      about: 'play' | 'jodhi' | 'thunee'
      guilty: boolean
      card?: Card
      suit?: Suit
      rule?: string
    }

export function cardPointsByTeam(play: RoundPlay): [number, number] {
  const out: [number, number] = [0, 0]
  for (const trick of play.tricks) out[teamOf(trick.winner)] += pointsOf(trick.plays.map((p) => p.card))
  return out
}

export function tricksWonByTeam(play: RoundPlay): [number, number] {
  const out: [number, number] = [0, 0]
  for (const trick of play.tricks) out[teamOf(trick.winner)]++
  return out
}

function jodhiByTeam(play: RoundPlay): [number, number] {
  const out: [number, number] = [0, 0]
  for (const claim of play.jodhiClaims) out[teamOf(claim.seat)] += claim.points
  return out
}

/** Whether a trick won by `winner` keeps a Thunee alive, and whether losing it was a partner catch. */
export function thuneeTrickResult(game: Game, caller: Seat, winner: Seat): { ok: boolean; partnerCatch: boolean } {
  if (game.rules.thuneeWinner === 'team') return { ok: teamOf(winner) === teamOf(caller), partnerCatch: false }
  return { ok: winner === caller, partnerCatch: winner === partnerOf(caller, game.playerCount) }
}

/** Scores the round, updates balls and dealer, and moves to `roundResult` or `gameOver`. */
export function finishRound(game: Game, play: RoundPlay, outcome: Outcome, events: GameEvent[]): void {
  const rules = game.rules
  const cardPoints = cardPointsByTeam(play)
  const jodhi = jodhiByTeam(play)
  const trumperTeam = teamOf(play.trumper)
  const lastWinner = play.tricks.length > 0 ? play.tricks[play.tricks.length - 1].winner : null

  let winner: Team
  let balls: number
  const detail: Partial<RoundSummary> = {}

  switch (outcome.kind) {
    case 'challenge': {
      const accusedTeam = teamOf(outcome.accused)
      winner = outcome.guilty ? otherTeam(accusedTeam) : accusedTeam
      balls = CHALLENGE_BALLS
      detail.challenge = {
        challenger: outcome.challenger,
        accused: outcome.accused,
        kind: outcome.about,
        guilty: outcome.guilty,
        card: outcome.card,
        suit: outcome.suit,
        rule: outcome.rule,
      }
      break
    }
    case 'thunee': {
      const caller = play.thunee!.caller
      const callerTeam = teamOf(caller)
      winner = outcome.success ? callerTeam : otherTeam(callerTeam)
      balls = outcome.success || !outcome.partnerCatch ? 4 : rules.thuneePartnerCatchBalls
      detail.thunee = { caller, success: outcome.success, partnerCatch: outcome.partnerCatch }
      break
    }
    case 'khanaak': {
      const caller = play.khanaak!.caller
      const team = teamOf(caller)
      const opp = otherTeam(team)
      const lostATrick = play.tricks.some((t) => teamOf(t.winner) !== team)
      const success =
        rules.khanaak === 'strict'
          ? lostATrick && lastWinner === caller && jodhi[team] + 10 > cardPoints[opp] + jodhi[opp]
          : lastWinner !== null && teamOf(lastWinner) === team && cardPoints[opp] < jodhi[team] + 10
      const backward = team !== trumperTeam
      winner = success ? team : opp
      balls = success ? (backward ? 6 : 3) : 4
      detail.khanaak = { caller, success, backward, jodhi: jodhi[team], opponentPoints: cardPoints[opp] }
      break
    }
    case 'double': {
      const caller = play.double!.caller
      const success = lastWinner === caller
      winner = success ? teamOf(caller) : otherTeam(teamOf(caller))
      balls = success ? 2 : 4
      detail.double = { caller, success }
      break
    }
    case 'normal': {
      const counting = otherTeam(trumperTeam)
      const wonLast = lastWinner !== null && teamOf(lastWinner) === counting
      const lastTrick = wonLast ? 10 : rules.lastTrick === 'transfer' ? -10 : 0
      const lines: ScoreLine[] = [
        { label: 'cards', value: cardPoints[counting] },
        { label: 'lastTrick', value: lastTrick },
        { label: 'call', value: play.callAmount },
        { label: 'jodhi', value: jodhi[counting] },
        { label: 'opponentJodhi', value: -jodhi[trumperTeam] },
      ]
      const total = lines.reduce((sum, l) => sum + l.value, 0)
      const target = game.playerCount === 2 ? rules.twoPlayerTarget : FOUR_PLAYER_TARGET
      if (total >= target) {
        winner = counting
        balls = play.callAmount > 0 ? 2 : 1
      } else {
        winner = trumperTeam
        balls = 1
      }
      detail.normal = { countingTeam: counting, lines, total, target }
      break
    }
  }

  game.balls[winner] += balls
  game.lastRoundWinner = winner

  const summary: RoundSummary = {
    roundNumber: game.roundNumber,
    reason: outcome.kind,
    winner,
    balls,
    ballsAfter: [game.balls[0], game.balls[1]],
    trumper: play.trumper,
    trump: play.trump,
    callAmount: play.callAmount,
    cardPoints,
    tricksWon: tricksWonByTeam(play),
    ...detail,
  }
  events.push({ type: 'roundScored', summary })

  const champion = winningTeam(game.balls, ballsTarget(rules, game.khanaakCalled), rules)
  if (champion !== null) {
    game.phase = { kind: 'gameOver', again: [], winner: champion, summary }
    events.push({ type: 'gameOver', winner: champion })
    return
  }

  const dealerTeam = teamOf(game.dealer)
  const dealerBehind = game.balls[dealerTeam] < game.balls[otherTeam(dealerTeam)]
  if (rules.dealerRotation === 'always' || !dealerBehind) game.dealer = next(game.dealer, game.playerCount)
  game.phase = { kind: 'roundResult', summary }
}
