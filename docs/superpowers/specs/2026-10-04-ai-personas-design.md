# Computer personas: cheating and challenging

## Goal

Computer players never cheat and never challenge, so a human can renege every round without being called out. That makes cheating free against computers, and computers that never cheat are dull opponents.

This change gives each computer a persona. Some personas cheat, all of them watch, and none is perfect. Getting caught depends on how well the cheat was played: a renege that is revealed on the very next trick is easy to spot, and one hidden until the last trick usually goes unnoticed.

Success: playing against computers, careless cheating gets caught often, patient cheating mostly pays, and some computers cheat in ways a watchful human can catch.

Games are both solo practice (one human, three computers) and mixed tables (friends plus computers, sometimes as a human's partner). A computer's cheating can cost its human partner's team, so personas are chosen by the host and shown at the table.

## Why the old rule existed

The rebuild spec said the AI "plays only legal cards; claims a Jodhi only when it holds one; never challenges". The reasons were simplicity, an AI-only simulation that treats any illegal play as an engine bug, and computers standing in for disconnected humans. Only the last one still matters: a stand-in must not cheat on a person's behalf. Stand-ins stay honest.

## Personas

| Persona | Cheats | Attention | Hunch challenges |
|---|---|---|---|
| Straight (default) | Never | Medium | Never |
| Sharp | Never | High | Rarely: only at a high suspicion threshold |
| Sly | When it judges the risk low | Medium | Never |
| Wild | When the prize is tempting, ignoring risk | Low | Often: at a low suspicion threshold |

Personas change only cheating and challenging. Card choice, calling, trump and special calls are unchanged.

"Surprise me" picks one of the four at random and hides it until the game ends.

A computer standing in for a human (`standIn`) plays as Straight whatever its seat says.

## Detection

### Proof

A computer challenges for certain only on proof it can see in its own view (the `full` memory view computers already receive):

- **Renege.** An opponent failed to follow suit S on an earlier trick, and now plays a card of suit S. They held S when they should have followed. The undercut restriction is checked the same way when it is on: an opponent who undercut a trump while holding a plain card, later shown by their playing a plain card.
- **False Jodhi.** An opponent's claim needs a K and Q (and J, if claimed with the Jack) of a suit, and one of those cards is in the computer's own hand, or has been played by another seat, or (when `jodhiCards` is `inHand`) was played by the claimer before the claim.

Each proof has an id: the accused seat, the kind, and the trick and card that revealed it. A later contradiction by the same seat is a new proof with a new id.

### One look

A computer gets one look at each proof, at the moment it becomes visible. The chance of noticing is:

```
notice = attention × memory × salience     (capped at 1)
```

- **attention** — from the persona: Sharp 0.95, Straight and Sly 0.6, Wild 0.35.
- **memory** — `0.5 ^ (gap / 2)`, where `gap` is the number of tricks strictly between the cheat and the reveal. Revealed on the next trick: 1; cheat on trick 1, revealed on trick 6: 0.25. For a false Jodhi, `gap` counts the tricks from the claim to the contradicting card; a card in the computer's own hand, or played before the claim, has gap 0.
- **salience** — starts at 1 and is multiplied up for each that applies: the cheater won the reneged trick (×1.3); that trick carried 30 or more points (×1.3); the revealing card is a J or 9 (×1.2); the computer's team led the reneged suit (×1.2). A false Jodhi contradicted by the computer's own hand gets ×1.5.

The roll is `hash(aiSalt, observer, proofId)` mapped to [0, 1). Because it is a pure function of saved state, re-evaluating the same proof gives the same answer, a server restart cannot grant a second look, and nothing about it lives in server memory.

If the roll is under `notice`, the computer challenges at once.

### Hunches

Sharp and Wild also challenge without proof when a suspicion score passes their threshold. The score, for an opponent seat, adds:

- that seat won a trick worth 30 or more by trumping or discarding instead of following suit;
- that seat made a Jodhi claim of 40 or more;
- that seat showed a void that looks unlikely: it trumped or discarded on a suit while most of that suit's cards are still unseen by the computer.

A hunch also gets one look per triggering event, rolled the same way. Wild's threshold is low, so it is often wrong; Sharp's is high, so it rarely guesses. A wrong challenge costs 4 balls as the rules already say.

## Cheating

When it is the computer's turn, the normal card choice is made from `legal` as now. A cheating persona also considers each card in `play` that is not in `legal`, and that would win the trick when the normal choice would not.

- **Sly** cheats when the trick is worth at least 20 points and its own estimated chance of being caught is below 0.25. The estimate applies the detection model with average attention (0.6) to when it will have to reveal: it counts how many tricks it can hold back its remaining cards of the reneged suit, given its hand. Holding a single card of that suit until late is the ideal case. Sly makes a false Jodhi claim only when no card the claim needs has been played or is visible to it, and at most once a round.
- **Wild** cheats whenever the trick is worth at least 20 points, or holds a J or 9, or would decide the round. It ignores reveal timing. It makes a false Jodhi claim when its team has won a trick and it holds at least one card of the claim.
- **Mood (Wild only).** Its thresholds drop by up to half when its team is behind in balls or behind in points this round. Mood is worked out from the view each time, not remembered.

All cheating is limited by what the engine already allows: `play` is the whole hand, and a false Jodhi claim is any `claimJodhi` the seat may make.

## Engine changes

- `SeatInfo` gains `persona: Persona` and `personaHidden: boolean`, where `Persona = 'straight' | 'sharp' | 'sly' | 'wild'`. Human and empty seats carry `straight` and `false`.
- `addAi` takes an optional `persona: Persona | 'surprise'`, defaulting to `straight`. For `surprise` the engine picks with `ctx.rng` and sets `personaHidden`.
- `Game` gains `aiSalt: number`, drawn with `ctx.rng` at every deal.
- `viewFor` masks a hidden persona (shown as `null`) until `gameOver`, and never includes `aiSalt`.
- `formatVersion` rises; loading an older save fills in `straight`, `false` and a new salt.
- `schema.ts` validates the new `addAi` field.

The engine stays pure: all randomness is `ctx.rng` or the salt.

## AI changes

- `src/ai/suspicion.ts`: proof detection, `notice`, the suspicion score and the hash roll. Pure functions of a view, a persona and the salt.
- `src/ai/choose.ts`: `chooseAction(view, persona, salt)` adds the cheat branch; `chooseJodhi` adds false claims; a new `chooseChallenge(view, persona, salt): Action | null`.
- The effective persona is `straight` when the seat is a stand-in.

## Server changes

- An `aiChallenge` hook beside `aiJodhi`. After every play, Jodhi claim and trick win, each AI-controlled seat on the other team runs `chooseChallenge` on its `full` view and applies the result if it returns one.
- Drive and Jodhi calls pass persona and salt.

The challenge lands at once. The client's paced playback keeps the card on screen before the challenge event. If it feels robotic in play, a deadline-based delay can follow.

## UI changes

- "Add computer" opens a choice of Straight, Sharp, Sly, Wild and Surprise me, each with a one-line description.
- A computer seat shows its persona name, or "?" when hidden, until game end reveals it.

## Tests

- **Detection:** a renege revealed next trick by a high card after winning a big trick is noticed by Sharp; one from trick 1 revealed on trick 6 with a low card usually is not (checked over many salts). A false Jodhi contradicted by the computer's own hand is noticed at high rates.
- **One look:** the same proof and salt always give the same decision.
- **Cheating:** Sly declines a cheat it would have to reveal next trick and takes one it can hold to the end; Wild takes a tempting cheat regardless; Straight and Sharp never return an illegal card.
- **Stand-in:** a stand-in in a Wild seat never cheats.
- **Simulation:** the existing honest-AI test runs with Straight and Sharp only and still asserts every play is legal. A new simulation seats all four personas, finishes every game under both presets, and sees both guilty and innocent challenges.
- **Secrecy:** the simulation's view check also rejects `aiSalt` and a hidden persona before game over.
- **Schema and save migration:** `addAi` with and without a persona; an old save loads.

## Out of scope

- Different card-playing skill per persona.
- Delayed challenges.
- Persona choice for stand-ins.
- Mood for personas other than Wild.
