# Hearts — Design

Date: 2026-10-05
Status: sections 2 to 6 built (sub-project C). 7.1 and 7.2 ready to build (E1); 7.3 follows them (E2); 8 and 9 follow sub-project D (E3)
Depends on: `2026-10-05-game-modules-design.md`

## 1. Purpose

Hearts is the second game in Tricks, and the test of the platform. It has no teams, no trump and no calling; it uses the full deck; play runs clockwise; and at the start of most rounds all four players act at once.

Success: four people, or one person and three computers, can play a full game of Hearts at `/hearts` with house rules, practice, and cheating with detection, and nothing in the room, client, practice or shell was written for it.

### Decisions

| Question | Decision |
|---|---|
| Players | Four. |
| Version | Black Lady: hearts count 1 each and the queen of spades 13. |
| Cheating | On by default. The offender takes 26. A wrong accuser takes 26. |
| What everyone can see | Who won each trick, the cards of the last completed trick, and the points each player has taken this round. |
| Passed cards | Locked once chosen. Exchanged when the fourth player has chosen. No timer. |

### Out of scope

Three and five players, partnership Hearts, Cancellation Hearts, and passing variants beyond those in section 3.

## 2. The game

- **Cards.** 52. In each suit the ace is high and the two is low.
- **Seats.** Seats are numbered in play order. Play runs clockwise, so the next seat is the player on the left.
- **The deal.** Thirteen cards each.
- **Passing.** Before play each player chooses three cards to give away, without seeing what they will receive. The direction turns with the round: left, right, across, then no pass, and round again. Cards are exchanged when everyone has chosen.
- **The opening lead.** Whoever holds the two of clubs leads it. This is forced: the app names the leader, so there is nothing to hide.
- **Following.** A player who holds a card of the suit led must play one. Otherwise any card may be played, subject to the next two rules.
- **The first trick.** No heart and no queen of spades may be played to it, unless the hand holds nothing else.
- **Breaking hearts.** A heart may not be led until a heart has been played to an earlier trick, unless the hand holds nothing but hearts. The queen of spades may be led at any time.
- **Winning a trick.** The highest card of the suit led. The winner leads next.
- **Scoring.** Each heart taken is 1 point and the queen of spades is 13, so a round has 26. Points are bad.
- **Shooting the moon.** A player who takes all 26 scores nothing, and each other player scores 26.
- **The end.** When a round ends with any player at 100 or more, the player with the lowest score wins. If the lowest score is shared, play another round.

## 3. House rules

```ts
export interface HeartsRules {
  allowCheating: boolean                      // true
  gameEndsAt: number                          // 100; 25 to 500
  passing: 'rotating' | 'left' | 'none'       // 'rotating'
  moon: 'othersAdd' | 'shooterSubtracts'      // 'othersAdd'
  jackOfDiamonds: boolean                     // false; when true the jack of diamonds is worth -10
  queenBreaksHearts: boolean                  // false
  pointsOnFirstTrick: boolean                 // false; when true the first-trick rule is dropped
}
```

Standard is the default. A preset stores only its differences. One more preset is built in: Omnibus (`jackOfDiamonds: true`).

`gameEndsAt` replaces the 100 in section 2. With `moon: 'shooterSubtracts'`, the shooter scores -26 and everyone else scores nothing.

With the jack of diamonds in play: it is not a point card for the first-trick rule, it does not count toward shooting the moon, and whoever takes it scores -10 however the rest of the round is scored. The one exception is a round ended by an accusation, which scores only the penalty (section 6). Scores may go below zero.

## 4. State, actions and events

`Game` extends the kit's `TableState` with `rules`, `scores: number[]`, `roundNumber`, and `phase`.

| Phase | Holds | Ends when |
|---|---|---|
| `lobby` | | the host starts |
| `passing` | `hands`, `direction`, `chosen: (Card[] \| null)[]` | all four have chosen. Skipped in a no-pass round. |
| `playing` | `play`, `turn` | a card completes the trick, or the round |
| `trickPause` | `play`, `deadline` | the deadline (the kit's `TRICK_PAUSE_MS`) |
| `roundResult` | `summary` | any human sends `nextRound` |
| `gameOver` | `winner`, `summary` | the host sends `rematch` |

`play` holds `hands`, `tricks`, `current`, `heartsBroken`, `received` (the three cards each seat was given) and `gave` (the three each gave). Every play is a kit `PlayRecord`. Chosen cards stay in the hand until the exchange.

Actions, beside the table's: `choosePass { cards }` (exactly three, all held, not already chosen), `playCard { card }`, `challengePlay { seat }`, `setRules`, `nextRound`, `rematch`.

Events: `dealt { roundNumber, direction }`, `passChosen { seat }`, `passesExchanged`, `cardPlayed { seat, card }`, `heartsBroken`, `trickWon { seat, points }`, `challengeResolved { challenger, accused, guilty }`, `roundScored { summary }`, `gameOver { winner }`, and the table's `seatChanged`.

```ts
export interface RoundSummary {
  roundNumber: number
  reason: 'normal' | 'moon' | 'challenge'
  points: number[]              // this round, by seat
  scoresAfter: number[]
  moon: Seat | null
  challenge?: { challenger: Seat; accused: Seat; guilty: boolean; rule: string | null; card: Card }
}
```

While cards are being passed the table waits on every seat that has not chosen (the kit's `waiting`), so a host can replace one who has stalled. `seatsToAct` returns those seats; during play, the seat whose turn it is.

## 5. Views

A view holds the viewer's own hand, hand sizes, the scores, the round number and the pass direction, and:

- while passing: who has chosen, and the viewer's own choice;
- in play: the current trick, the completed tricks (winners always; cards for the last one only, or for all with `'full'` memory), whose turn it is, whether hearts are broken, `taken` (points each seat has taken this round), and the viewer's own `received` and `gave`.

Never in a view: another hand, another player's chosen or passed cards, the cards of tricks before the last completed one (with `'table'` memory), `handBefore`, `broke`, `aiSalt`, and a hidden persona before the game is over.

`availableActions(view)` gives `pass` (the cards that may be chosen, while the viewer has not chosen), `play`, `legal`, `challengePlay`, `nextRound`, `rematch`, `reclaimSeat`. `apply` validates round actions against it.

## 6. Cheating in Hearts

With `allowCheating` on, any card in the hand is accepted on the player's turn, except at the opening lead, where only the two of clubs is. Hearts has three excuses:

| Rule | The play | Legal only if the hand holds no |
|---|---|---|
| `followSuit` | A card not of the suit led | card of the suit led |
| `firstTrickPoints` | A heart or the queen of spades on the first trick (when `pointsOnFirstTrick` is off) | card that is neither a heart nor the queen of spades |
| `heartsLead` | Leading a heart before hearts are broken | card that is not a heart |

A heart played off suit to the first trick needs both of the first two. Hearts are broken by any heart played, legal or not; with `queenBreaksHearts`, by the queen of spades too.

There are no declarations in Hearts, so there are no false claims.

**Accusing.** During play or the trick pause, any player may accuse any other player who has played a card this round. All of that seat's plays this round are checked, as in Thunee. The round ends at once.

- **Guilty:** the accused scores 26 for the round and everyone else scores nothing.
- **Not guilty:** the accuser scores 26 and everyone else scores nothing.

As in Thunee, an accusation ends the round with no other score: tricks already taken do not count, a jack of diamonds already taken scores nothing, and nobody shoots the moon. An unchallenged cheat stands.

## 7. Computer players

The search spike's answer (`2026-10-05-search-player-spike-design.md`, section 7) sets the order: a hand-written player first, then a search player that must beat it.

### 7.1 The hand-written player

`decide(view, mind)` returns an action and a reason code, as Thunee's does. The coach's first tier puts those reasons into words. Every chance is `roll(aiSalt, seat, id)`, so a decision never changes on re-evaluation.

**Passing.** Choose three, in this order of priority:
1. the queen, king and ace of spades, when the hand holds fewer than five spades;
2. the ace, king and queen of hearts;
3. cards that empty a suit of two or fewer clubs or diamonds, highest first;
4. the highest cards left.

**Play.**
- **The first trick:** the highest club, since no points can fall. With `pointsOnFirstTrick` on, play it as any other trick.
- **Leading:** a low card from a suit where it is unlikely to win. Lead spades below the queen while the queen is unseen and not held. Never lead the queen of spades or a high heart unless nothing else is left.
- **Following:** the highest card that stays under the card winning the trick. If every card would win, and the trick holds no points and this seat plays last, win with the highest. Otherwise the lowest.
- **Void in the suit led:** the queen of spades; then the ace or king of spades while the queen is unseen; then the highest heart; then the highest card.
- **Stopping a moon:** when one player has taken every point so far and at least half of them, take a trick with points if it is cheap to do so.
- **With the jack of diamonds in play:** win it when the trick holds no other points.

This is a starting point. The implementer may refine it, and must show that the player clearly beats the random legal player on duplicate deals with every seat taken in turn.

### 7.2 Personas

The honest choice comes first and the persona sits on top, as in Thunee:
- **A cheat** is a renege that avoids taking points the honest card would take, above all the queen of spades. Sly weighs the chance of being shown up; Wild does not.
- **Holding back** uses the kit's `exposes`.
- **Catching** uses the kit's `playProofs` and `noticed`. A proof is more salient when the cheat dodged the queen of spades. Sub-project C already supplies the honest catcher; this adds attention by persona.
- **Suspicion signals**, for the personas that act on a hunch: a void shown so early it is unlikely (`chanceOfVoid`), and a discard that dodges the queen.
- With `allowCheating` off, every persona plays as Straight.

### 7.3 The search player

Built afterwards, as its own sub-project, in `src/kit/search/` with a Hearts adapter. It follows the four conditions in the spike spec's decision: one in-place step shared with `apply`; hard rules of the deal kept apart from soft evidence; seeding from the salt, the seat and the decision; a fixed number of worlds.

Hearts supplies: what a seat knows about the hidden cards (its own hand, cards played, the three it gave and to whom, shown voids as soft evidence), "rebuild a game from a view", and the value of a finished round to one seat (its own points, lower is better, with a moon scored as the rules say). Passing is searched over a pruned set of candidate passes, not all 286.

**The gate.** Hearts adopts the search player only if, on duplicate deals with every seat taken in turn and every pass direction, it takes fewer points per round than the hand-written player with a 95% interval clear of zero, and a decision fits a budget measured in a browser and in a room. Otherwise Hearts keeps the hand-written player.

**Result (2026-10-06): the gate fails, and Hearts keeps the hand-written player.** Its `decide` is unchanged. These numbers replace those of an earlier run, whose adapter merged two cards that a card on the table separated, and so dropped a legal choice. The verdict is the same: over the same deals the fix changed the mean by −0.030 [−0.067, 0.008].
- **Strength.** Over 400 duplicate deals the search player at 30 worlds took 1.419 [1.248, 1.591] more points per round than the hand-written player; at 100 worlds it was still worse by 0.931 [0.416, 1.447] (section 9 of `2026-10-06-search-player-design.md`). The loss is in card play: searching only the pass was level with the hand-written pass.
- **Speed.** It is also too slow: the 95th percentile of a decision in Chromium throttled four times is 318 ms at 30 worlds and 109 ms even at 10, against a bar of 100 ms.
- **Cheating and determinism.** It never failed against cheats in 500 rounds, and every decision replays identically from a saved game.

The adapter (`src/games/hearts/ai/search.ts`, with its imagined games in `imagine.ts`) and the gate (`src/games/hearts/ai/gate/`) stay, so a stronger rollout can be tried against the same gate.

## 8. Screens

Checked at 390 by 844.

- **The hand.** Thirteen cards must fit: one row, overlapped, sorted by suit then rank, with every card's index visible and each still easy to tap. The shared `Hand` gains this and a mode for choosing several cards.
- **Passing.** Choose three, then one button names the direction ("Pass left"). After the exchange the three cards received are marked until the first card is played.
- **The table.** Three opponents at left, top and right, placed clockwise. Each shows a name, cards held, points taken this round and the total score. The middle shows the trick, the pass direction and whether hearts are broken.
- **Controls.** The last trick, the accuse sheet, the rules, the menu: shared with Thunee.
- **Round result.** A table of this round's points and the totals, with the reason when it was a moon or a challenge.
- **Game over.** The winner, with the rematch for the host.
- **Home at `/hearts`.** Create, join, presets, practice.

Copy follows the app's conventions: sentence case, plain language.

## 9. Practice and coach

Practice works as it does for Thunee: one person, three honest computers, a clock that waits. The coach's first tier (hints and warnings) comes from `2026-10-05-coach-tiers-design.md`. Written lessons for Hearts are a later addition; the topics would be passing, following suit, breaking hearts, the queen of spades, the first trick, shooting the moon and accusing.

## 10. Testing

- Unit tests for every rule in section 2 and every rule field under each value.
- Passing: each direction; the no-pass round; a seat cannot see what it will receive; choosing twice is rejected.
- Excuses: each of the three recorded when broken and not when legal; the opening lead refuses every card but the two of clubs with cheating on.
- Accusations: guilty and not guilty; scores and the summary; the round ends.
- Scoring: 26 points in every normal round; both moon rules; the jack of diamonds; the end of the game with and without a shared lowest score.
- The contract simulation from the game-modules spec, with: every card accounted for in every state; no view leaking a hidden card; with cheating off, no rule-breaking card ever accepted.
- Views: the list in section 5.

## 11. Build order

Sub-project C: sections 2 to 6, as `src/games/hearts/engine/` and a module in `src/games/hearts/index.ts`, with the random legal player.

Sub-project E1: the hand-written player and personas (7.1, 7.2), in `src/games/hearts/ai/` only.

Sub-project E2: the search player and its gate (7.3).

Sub-project E3: screens (8), practice and presets (9).
