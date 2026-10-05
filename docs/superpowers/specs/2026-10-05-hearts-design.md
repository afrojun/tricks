# Hearts — Design

Date: 2026-10-05
Status: sections 2 to 6 ready to build (sub-project C); sections 7 to 9 follow sub-projects B and D (sub-project E)
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

How Hearts gets its opponents depends on the search spike (`2026-10-05-search-player-spike-design.md`).

- **If search is adopted:** Hearts supplies "rebuild a game from a view" and a value for a round's result (points taken, lower is better, with shooting the moon scored as the rules say). Passing is decided by search as well: the candidates are the hand's three-card sets, pruned to the likely ones.
- **If not:** a hand-written player. Passing: give away the queen, king and ace of spades unless well covered by low spades; then high hearts; then cards that empty a short suit. Play: lead low; duck when it can; when void, throw the queen of spades, then high hearts, then high cards; never take a trick holding the queen of spades when a lower card avoids it; stop a player who has every point so far from taking the rest.

Either way the honest choice comes first and the persona sits on top, as in Thunee:
- **A cheat** is a renege that avoids taking points the honest card would take, above all the queen of spades.
- **Holding back** uses the kit's `exposes`.
- **Catching** uses the kit's `playProofs` and `noticed`. A proof is more salient when the cheat dodged the queen of spades.
- **Suspicion signals:** a void shown so early it is unlikely (`chanceOfVoid`), and a discard that dodges the queen.

Until then sub-project C supplies a random legal player, for the simulation and as a stopgap, and an honest catcher: a computer that accuses only when it holds a proof, so that cheating is never free.

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

Sub-project E: computer players (7), screens (8), practice and presets (9).
