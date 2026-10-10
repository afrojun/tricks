# Spades — Design

Date: 2026-10-10
Status: built (2026-10-10). Reviewed twice by GPT-6.1-Sol before the build, screens by Fable. Where the build settled a detail the draft left open, this text says what was built.
Depends on: `2026-10-05-game-modules-design.md`, `2026-10-05-hearts-design.md` (the shape this follows), `2026-10-05-coach-tiers-design.md`

## 1. Purpose

Spades is the third game in Tricks. It is the first with a fixed trump, the first where every player calls a number of tricks, and the first played by two, three or four. It is built the way Hearts was: a module, a client and a practice table, with nothing in the room, the Worker, the protocol or practice written for it.

Success: two, three or four people, or one person and computers, can play a full game of Spades at `/spades` with house rules, practice with a coach, and cheating with detection.

### Decisions

| Question | Decision |
|---|---|
| Players | Two, three or four. Four play in two partnerships, partners opposite; two and three play each for themselves (three is "cutthroat"). |
| The rules | Pagat's standard rules (pagat.com/auctionwhist/spades.html), which most apps and rule books follow: call once each, Nil, bags, spades broken before they are led, game to 500. |
| Cheating | On by default, as in the other games. A caught renege sets the cheat's side, the traditional penalty; "Bid plus three" is the house-rule alternative. |
| Built-in variant | Jokers: the big and little joker and the twos of diamonds and spades are the top four trumps. The best-known variant; built last (section 12). |
| Signals between partners | Out. `2026-10-09-signals-design.md` stays a draft. |
| The search player | Out. Spades plays a hand-written player; a search adapter and its gate may follow, as for Hearts. |

### Out of scope

Six players, the bidding variants (10 for 200, Moon, Blind 6, Bemo, Double nil bonuses, No trump), team minimum calls, losing at minus 200, and timers on calling.

## 2. The game

- **Cards.** 52. In each suit the ace is high and the two is low. Spades are always trump.
- **Seats.** Numbered in play order. Play runs clockwise, so the next seat is the player on the left. With four, seats 0 and 2 are partners against 1 and 3.
- **Sides.** A side is a partnership with four players, or one player with two or three. Contracts, bags and scores belong to sides.
- **The dealer.** Drawn with `ctx.rng` for the first round, then the next seat each round.
- **The deal.**
  - Four players: thirteen cards each.
  - Three players: seventeen each; the card left over is set aside unseen.
  - Two players: no deal. The stock is face down. Starting with the player left of the dealer, each in turn sees the top card and either keeps it, then sees the next and discards it, or discards it, then takes the next. Discards are face down. After thirteen turns each, both hold thirteen and the stock is gone. Each player remembers the thirteen cards it discarded.
- **Calling.** Starting left of the dealer, each player calls once, in turn, a number of tricks from 1 up to the hand size, or Nil. There is no passing and no need to call higher than anyone else. A call cannot be changed. A side's contract is the sum of its players' calls other than Nil; a side whose players all called Nil has no contract.
- **Nil.** A call to take no tricks at all. Calling 0 is always Nil. Both partners may call Nil; each is scored on its own, with no extra bonus.
- **The opening lead.**
  - Four players: the player left of the dealer leads any card; spades are not yet broken, so not a spade unless the hand holds nothing else. Under the house rule `firstLead: 'lowestClub'`, whoever holds the two of clubs leads it instead.
  - Three players: whoever holds the lowest club in play (the two, or the three when the two was set aside) leads it, as Pagat has it.
  - Two players: the player left of the dealer leads, as with four.
  - A forced lead names its card and its player, so there is nothing to hide and no cheat is offered.
- **Following.** A player who holds a card of the suit led must play one. Otherwise any card, a spade included.
- **Breaking spades.** A spade may not be led until a spade has been played to an earlier trick, unless the hand holds nothing but spades.
- **Winning a trick.** The highest spade, or with none, the highest card of the suit led. The winner leads next.
- **Scoring a side.** For each side, with `contract` its non-Nil players' calls added up, `tricks` the tricks those players took, and `nilTricks` the tricks its Nil players took:
  - `made` is `tricks >= contract`. A side with no contract has made it, and scores nothing for it.
  - Contract: `10 × contract` if made, `−10 × contract` if not.
  - Bags this round: `tricks − contract` if made, 0 if not, plus `nilTricks` either way. Each bag scores 1.
  - Each Nil: plus 100 if its player took no trick, minus 100 if it took any (200 for Blind nil). A Nil player's tricks never count toward the contract.
  - Bag penalty: bags are counted across the game. Each time a side's count reaches 10, 20, 30 and so on, it loses 100; the count is never reset.
- **Three players.** Pagat's cutthroat takes 10 off for each trick over. Tricks scores three players exactly as four, by side, the variant Pagat also lists, so the rules, the screens and the coach have one way to count.
- **The end.** When a round ends with any side at 500 or more, the side with the highest score wins. If the highest is shared, play another round.

### 2.1 Blind nil (a house rule, off by default)

With three or four players, a player whose side's score is at least 100 below every other side's may call Blind nil, on its turn to call, if it has not yet looked at its hand. Each round's hand arrives face down until its player looks; calling Blind nil turns it up. It scores plus or minus 200. With two players there is no Blind nil: both hands were chosen card by card.

With four players, only one partner may call Blind nil. After calling ends and before the opening lead, the Blind nil player gives two cards face down to the partner; the partner, seeing them, gives two back. With three players there is no exchange.

## 3. House rules

```ts
export interface SpadesRules extends CommonRules {
  allowCheating: boolean               // true
  gameEndsAt: number                   // 500; 100 to 1000, in steps of 50
  nil: boolean                         // true
  blindNil: boolean                    // false; section 2.1
  bagPenalty: boolean                  // true; 10 bags cost 100
  firstLead: 'left' | 'lowestClub'     // 'left'; four players only
  renege: 'set' | 'bidPlusThree'       // 'set'; section 6
  jokers: boolean                      // false; section 3.1
}
```

Standard is the default. One preset is built in: Jokers (`jokers: true`).

### 3.1 Jokers

Two jokers join the deck and the twos of clubs and hearts leave it, so it stays at 52. Trump, from the top: the big joker, the little joker, the two of diamonds, the two of spades, then the ace of spades down to the three. The two of diamonds is a spade in every way: it follows spades, a diamond lead cannot be followed with it, leading it before spades are broken breaks the rule, and playing it breaks spades. The lowest club in play is the three (with three players, the four when the three was set aside). Everything else is unchanged.

A joker is a card of the rank `BJ` or `LJ` and the suit `spades`, so every card still has a suit; the face draws a joker. Spades' `suitOf(card)` gives the suit a card is played as (spades for the two of diamonds with Jokers on, otherwise the printed suit), and its `strength` orders trump as above. The kit's `ledSuit`, `followSuit` and `trickWinner` take `suitOf` (defaulting to `card.suit`), and legality, the recorded rules broken, proofs, the computers and the coach all read suits through it.

## 4. State, actions and events

`Game` extends the kit's `TableState` with `rules`, `dealer`, `scores` and `bags` (by side), `roundNumber`, and `phase`.

| Phase | Holds | Ends when |
|---|---|---|
| `lobby` | | the host starts |
| `drawing` | `stock`, `hands`, `out`, `turn` | two players: the stock is empty |
| `calling` | `hands`, `out`, `calls: (Call \| null)[]`, `looked: boolean[]`, `turn` | every seat has called |
| `exchanging` | `hands`, `out`, `calls`, `blind: Seat`, `gave: Card[] \| null`, `returned: Card[] \| null` | four players, after a Blind nil: the Blind nil player has given two and its partner has given two back |
| `playing` | `play`, `turn` | a card completes the trick, or the round |
| `trickPause` | `play`, `deadline` | the deadline (the kit's `TRICK_PAUSE_MS`) |
| `roundResult` | `summary` | any human sends `nextRound` |
| `gameOver` | `winner`, `summary`, `again` | everyone says Again (the kit's `againComplete`) |

`Call` is `{ tricks: number; blind: boolean }`: 0 tricks is Nil, and only Nil may be blind. `out` holds the cards out of play for the whole round, so every card is accounted for in every phase: `setAside` (the leftover card with three players, else null) and `discards` (by seat, with two players, else empty). `looked` starts true for every seat that may not call Blind nil this round (it needs `blindNil` on, three or four players, and a side trailing by 100 at the deal), so only a seat with the choice sees its cards face down. `play` holds `hands`, `out`, `calls`, `tricks`, `current`, `spadesBroken`, `raised` (by side, the "Bid plus three" penalties on it; a contract is the side's calls plus three for each), `settled` (by seat, how many of its plays an accusation has already judged), `nilFailed` (by seat, a Nil lost to a `bidPlusThree` penalty) and, after a Blind nil, `exchange: { blind, gave, returned }`. Every play is a kit `PlayRecord`.

Actions, beside the table's: `draw { keep: boolean }`, `lookAtHand`, `call { tricks }` (0 for Nil), `callBlindNil`, `giveCards { cards }` (exactly two, held; from the Blind nil player first, then from its partner), `playCard { card }`, `challengePlay { seat }`, `setRules`, `nextRound`, `rematch`.

Events: `dealt { roundNumber, dealer }`, `drew { seat }`, `called { seat, call }`, `cardsGiven { seat }`, `cardsExchanged`, `cardPlayed { seat, card }`, `spadesBroken`, `trickWon { seat }`, `nilBroken { seat }` (its first trick), `contractMade { side }` (the trick that makes it), `challengeResolved { challenger, accused, guilty, penalty, rule, card }` (the rule broken, or null, and the card that broke it, or the accused's last card), `roundScored { summary }`, `gameOver { winner }`, and the table's `seatChanged`.

```ts
export interface SideResult {
  contract: number
  tricks: number                       // its non-Nil players' tricks
  made: boolean
  nils: { seat: Seat; blind: boolean; tricks: number; points: number }[]
  bags: number                         // gained this round
  bagPenalty: number                   // 0 or -100 (or less, past several tens)
  points: number                       // this round, all of it
}

export interface RoundSummary {
  roundNumber: number
  reason: 'normal' | 'challenge'
  sides: SideResult[]
  scoresAfter: number[]
  bagsAfter: number[]
  challenge?: { challenger: Seat; accused: Seat; guilty: boolean; rule: string | null; card: Card }
}
```

The table waits on the seat whose turn it is while drawing and calling (the kit's `waiting`), and while exchanging on the seat that gives next, so a host can replace one who stalls. `seatsToAct` returns those seats; during play, the seat whose turn it is.

## 5. Views

A view holds the viewer's own hand, hand sizes, the dealer, the calls made so far, the contracts, tricks taken by each seat, `spadesBroken`, `settled` and `nilFailed`, the scores and bags, and:

- while drawing: the stock's size and, on the viewer's own turn only, its top card;
- for the whole round with two players: the viewer's own discards, each of which it saw;
- while calling with Blind nil possible: an empty hand until the viewer has looked; the server withholds it;
- while exchanging: to the Blind nil player and its partner only, the cards given each way so far;
- in play: the current trick, the completed tricks (winners always; cards for the last one only, or for all with `'full'` memory), whose turn it is, and after an exchange, to its two players, the cards given each way.

Never in a view: another hand; the stock, except its top card to the drawer on its turn; another seat's discards; the cards of an exchange to anyone outside it; the card set aside with three players; a hand its owner has not looked at (computers included: `'full'` memory does not reveal it); the cards of tricks before the last completed one (with `'table'` memory); `handBefore`, `broke`, `aiSalt`, and a hidden persona before the game is over.

`availableActions(view)` gives `draw`, `lookAtHand`, `call` (the calls open to the viewer now: 1 to the hand size, Nil when `nil` is on, Blind nil when allowed), `give`, `play`, `legal`, `challengePlay`, `nextRound`, `rematch`, `reclaimSeat`. `apply` validates round actions against it.

## 6. Cheating in Spades

With `allowCheating` on, any card in the hand is accepted on the player's turn, except a forced opening lead. Spades has two excuses:

| Rule | The play | Legal only if the hand holds no |
|---|---|---|
| `followSuit` | A card not of the suit led | card of the suit led |
| `spadesLead` | Leading a spade before spades are broken | card that is not a spade |

Spades are broken by any spade played, legal or not. With Jokers, "spade" means anything `suitOf` makes a spade. There are no declarations, so no false claims.

**Accusing.** During play or the trick pause, any player may accuse any other who has played a card this round that is not yet settled. That seat's unsettled plays are checked, as in the other games.

**`renege: 'set'` (the default).** The round ends at once.
- **Guilty:** the accused's side is set: minus 10 a trick of its contract and minus 100 for each Nil (200 for Blind nil), with no bags. Every other side scores as if it made exactly what it called: 10 a trick of its contract and 100 for each Nil (200 blind), with no bags.
- **Not guilty:** the same, with the accuser's side set instead.

**`renege: 'bidPlusThree'`.** Play goes on.
- **Guilty:** the accused's side's contract rises by 3. If the accused called Nil and it still stands (no trick taken), that Nil fails instead (`nilFailed`), scoring as broken whatever it takes from then on, and its tricks are bags as ever. A side with no contract that is raised has a contract of 3 it cannot make, so it is set.
- **Not guilty:** the same falls on the accuser.
- Either way the accused's plays so far become settled (`settled`, in every view). Accusations, the computers' proofs (`playProofs`) and a careful cheat's `exposes` read only unsettled plays as the rule broken, while every play, settled or not, still counts as evidence of what a hand held: a void shown before a settlement still proves a later renege.

An unchallenged cheat stands.

## 7. Computer players

### 7.1 The hand-written player

`decide(view, mind)` returns an action and a reason code, as in the other games. Every chance is `roll(aiSalt, seat, id)`. This is a starting point: the implementer may refine it, and must show that it clearly beats the random legal player on duplicate deals with every seat taken in turn, at each table size.

**Drawing (two players).** Keep a spade, an ace, or a king with another card of its suit; otherwise discard.

**Calling.** Count tricks:
- the ace of spades 1; the king with at least one other spade 1; the queen with at least two others 1; each spade past the third 1;
- a side ace 1, or 0.5 in a suit of six or more; a side king with at least one other card of its suit 0.5;
- a void or singleton in a side suit, with spades left over after the counts above, 1 each up to the spare spades.

Round down (to the nearest with three, whose long hands the count undervalues). With fewer than four, a side king with a guard counts a whole trick and a side queen with two beside it half. With four players, the second of a partnership trims its count by one when the two calls would reach eleven or more. Call Nil when the count is under 1, the hand holds no ace or king of spades and at most three spades, none above the nine, and every side suit holds a card below the six; a partner does not call Nil when the other already has. Never Nil with three: seventeen cards are too many to duck with. Blind nil only when the side trails by 200 or more, decided before looking, on a roll that comes up three times in ten.

**Play.**
- **Leading:** a side ace or a king whose ace has gone; then from the longest side suit; spades once broken when the side holds the most of them. Never lead into a partner's Nil with a card it must cover.
- **Following:** if the partner's card is winning and stays so, play low. Otherwise win as cheaply as the side still needs tricks; duck when the contract is made and the other side cannot be set, to avoid bags.
- **Void:** trump with the lowest spade that wins when the side needs tricks; otherwise throw the lowest card of the shortest side suit.
- **Nil:** the Nil player plays the highest card that still loses; its partner wins tricks the Nil player would otherwise take. Against a Nil, lead low into its long suits and keep cards under its likely ones.

### 7.2 Personas

As in Hearts: the honest choice comes first and the persona sits on top.
- **A cheat** is a renege that wins a trick the contract needs, or saves a Nil. Sly weighs the chance of being shown up against the cost of being caught (the side set, or three more tricks); Wild does not, but takes only a quarter of its chances to steal a trick.
- **Holding back** uses the kit's `exposes`; **catching** uses `playProofs` and `noticed`. A proof is more salient when the renege saved a Nil or made a contract.
- **Suspicion signals:** a void shown unusually early (`chanceOfVoid`), and a Nil that survives a trick it should have taken.
- With `allowCheating` off, every persona plays as Straight.

## 8. Screens

Checked at 390 by 844. Built from the shared parts in the Sunburst look; Hearts' table is the model, and what Spades needs beyond it is in section 10. Designed by Fable.

- **The scoreboard.** One ticket per side at the top, as Thunee's: the score in the numeral block (minus signs included), the side's name, and under it a track of ten dots for its bags, filling across rounds and emptying with the penalty. With `bagPenalty` off there is no track, only the count ("7 bags"). Two sides are yellow and blue with Menu between; with three, Menu moves to the right, a third side colour, ink with paper numerals (`--team2`), joins the tokens, and the narrower tickets show the bags as a count rather than dots. Under each ticket the trick pile reads the side's tally, "3 of 5", yellow once the contract is made, with the overs after it, "+2"; a side whose only call is Nil reads "Nil", and "Nil broken" in red. It opens the last trick, as Thunee's does.
- **Seats.** Opponents clockwise: four at left, top and right; two at top; three at left and right with the top empty, so a trick's cards still come from the side they were played on and `Where` needs no new value. Each seat shows a name, cards face down, and a tally line kept through the round: "2 of 4", "Nil", "Nil broken", or a dash before its call. A call lands as a bubble on the seat ("4!", "Nil!"), as Thunee's calls do, then settles into the line. With four, the tally sits on a small plate in the side's colour, the same as its ticket's numeral block, so partners read as a pair; the viewer's own line does the same.
- **Names.** A side is named by `sideName(view, side)`, as Thunee's `teamName`: the viewer's own is "You and Priya" with four, "You" otherwise.
- **The middle.** The trick, and under it the fact chip "Spades not broken ♠", on once they are. The calling, drawing and exchange panels sit over the trick stage, as Hearts' pass does, never over the hand.
- **The hand.** Thirteen in one row, as Hearts. Seventeen does not fit: at 390 each card would show a 16px strip, too narrow for an index or a finger. Dealt more than thirteen, `Hand` shows two tiers, the sorted hand split in two of nine and eight, the back tier raised half a card so its indices show. The split falls at a suit boundary when one is within two cards of the middle, and otherwise inside a suit, so a hand of fifteen spades still splits evenly. The tiers hold for the whole round (`most` decides them), so the trick stage never moves.
- **Calling.** A panel, not a sheet: the hand must stay in view. Its numbers are `CallGrid` in `src/ui/Call.tsx`, shared with Thunee and later Call Break and Oh Hell: a line (whose call it is; with four, the partner's call, or that the partner calls after you), a grid of the numbers offered, as many a row as fit, and the named calls (Nil, Blind nil) as full-width buttons under it, Blind nil in red. Each press plays `tap`. Others' turns show the line alone, the seat to call in yellow. In practice the coach's note sits in the panel.
- **Blind nil.** A seat that may call it sees its cards face down, fanned to their count, and two buttons in the panel: See my cards, and Blind nil. The exchange picks two in the hand, as Hearts' pass, then "Give two to Priya"; the two received are marked New until the first play.
- **Drawing (two players).** The stock in the middle, a stack of backs with "24 left", and on the viewer's turn the top card face up beside it with Keep (primary) and Discard. Keep: it goes to the hand, and the next card turns up and slides to the discards. Discard: it slides there, and the next slides face down into the hand and turns up. The opponent's turns change only the counts. The hand is laid out for thirteen from the first card.
- **Round result.** One block per side, the viewer's in bold: the contract line ("Called 5, took 6": made, +50 and 1 bag; or set, −50), a line per Nil (made +100; broken, with the tricks taken, −100; 200 blind), the bag penalty when it fell, then the round's points and the total, with "7 bags, penalty at 10" under it ("7 bags" with `bagPenalty` off). A headline as Hearts' says what mattered; a challenge's verdict adds that every other side scored its call.
- **Game over.** The winning side ("You and Priya win"), standings from the highest down, Again.
- **Moments and sounds.** All from events, with the recordings already in `public/sounds/`: a number call, one knock and the bubble; Nil, a `call` moment with the knock; Blind nil, the same with the slam; spades broken, a `call` moment as hearts broken; Nil broken, a `danger` moment with the rubber stamp; a contract made, a toast ("Your side has made its 5") and one chip; the round scored, one `danger` moment "Set" naming every side set, with the stamp, then one "Ten bags" naming every side the penalty fell on, with the pot pushed over; a won game as in the other games. Two new `Sound` names reuse the files, `chip` and `bags`; no new recording is needed. Playback holds a sync for its longest event's dwell while the moments queue one after another, so each event's dwell covers everything its sync can queue: the play that completes a trick covers both spades broken and a Nil broken on that trick; `roundScored` covers one beat per side set and one per side's bag penalty, read from the summary, and the win when the round ends the game.
- **Home at `/spades`.** Create, join, presets, practice; tables of two, three, or "Four, in pairs".

## 9. Practice and coach

Practice works as for Hearts: one person and honest computers, a clock that waits, at any of the three table sizes. Three drills, as the other games have: trumping a trick, not leading spades unbroken, and playing under a trick on Nil. The coach starts as the kit's `baselineCoach` over `decide`, with a phrase for each reason code. Written lessons come later; the topics would be calling, Nil, bags, breaking spades, playing with a partner, and accusing.

## 10. Changes outside the game

Each is small and done before the game needs it, with its own tests. A move takes the code out of the game it came from, which then uses the shared version, so nothing is kept twice:

1. **The 52-card deck.** Hearts' ranks, `createDeck` and `strength` move to the kit; Hearts imports them from there.
2. **Partners.** Thunee's `teamOf` and `partnerOf` move to the kit as a partnership helper for four seats; Thunee imports them from there.
3. **A suit that must be broken.** Hearts' `heartsLead` and Spades' `spadesLead` are one excuse with a different suit: the kit gains it beside `followSuit`, and Hearts uses it.
4. **A play suit.** `ledSuit`, `followSuit` and `trickWinner` take an optional `suitOf` (section 3.1).
5. **Settled plays.** The kit's `SeenPlay` gains `settled`: `playProofs` and `exposes` never treat a settled play as the cheat, but still use it as the card that reveals one (section 6).
6. **Three seats on screen.** `place` in `src/ui/seats.ts` puts the two opponents of three at left and right; `Where` and the trick area need nothing new. A third side colour, `--team2`, joins the tokens.
7. **The hand.** The shared `Hand` shows two tiers when `most` is over thirteen, and a face-down mode for Blind nil and the two-player draw.
8. **The calling grid**, `CallGrid` in `src/ui/Call.tsx`: the numbers offered and the named calls, so Oh Hell can later withhold the dealer's forbidden number. Thunee's calling grid (its amounts and Pass) is the same shape and moves onto it, each number spelled on its button ("Call 30") as before.
9. **A joker face** for the shared `Card`.

Registering the game, as AGENTS.md's "Adding a game" lists: the module in `src/games/index.ts` with `FORMAT_VERSION` 1; the contract fixture in `FIXTURES` in `src/games/index.test.ts` and `src/kit/search/step.test.ts`; the client in `GAMES` and `LOADERS` in `src/ui/games.ts`; the rule book and its line in `src/presets/books.test.ts`; the coach in `COACHED` in `src/practice/coaches.test.ts`.

The contract test's `COVERAGE` expects the same phases at every table size. Spades' phases differ by size (`drawing` only with two, `exchanging` only with four and Blind nil), and `checkMalformed` starts from default rules and level scores, which never reach an exchange: nobody trails by 100. `COVERAGE` gains phases by table size, and the fixture a start under given rules and scores, with a side trailing, that drives a Blind nil call, so both stages of the exchange (the gift and the return) are probed.

## 11. Testing

- Unit tests for every rule in section 2 and every rule field under each value, at each table size.
- Drawing: thirteen each; the top card shown only to the drawer on its turn; a seat never sees the other's discards.
- Calling: order from the dealer's left, the calls offered, Nil, both partners Nil, Blind nil only when trailing by 100 and only before looking, the hand withheld until looked at, from computers too.
- Exchanging: the Blind nil player gives first, the partner sees those cards and gives back, nobody else sees either.
- Scoring, by the formula in section 2: made, set, bags and the penalty across tens, Nil and Blind nil with and without the partner making the contract, a side with no contract, three sides, the end and a shared top score.
- Opening leads at each table size and under `firstLead`, including the three of clubs when the two was set aside.
- Excuses: each recorded when broken and not when legal, with Jokers too (leading the two of diamonds, following a diamond lead); the forced opening lead.
- Accusations under each `renege` value: guilty, not guilty, scores, a failed Nil, settled plays never judged twice, and a void shown before a settlement still proving a later renege.
- The contract simulation from the game-modules spec at each table size, with every card accounted for in every state (hands, tricks, set aside and discards), no view leaking a hidden card, and with cheating off no rule-breaking card accepted.

## 12. Build order

1. Section 10, items 1 to 5.
2. The engine and module for four players (sections 2 to 6), with the random legal player.
3. Three and two players.
4. The computer players and personas (section 7).
5. Section 10, items 6 to 8; the screens, practice and coach (sections 8 and 9).
6. Jokers (section 3.1, section 10 item 9).
