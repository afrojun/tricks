# Sunburst — the look and sound of Tricks

Date: 2026-10-06
Status: decided, not built. The branch `balatro-look` is empty. The mockups that settled it live outside the repo, in `~/.cache/agent-artifacts/` on the dev machine (`tricks-directions.html`, `tricks-sounds*.html`, `tricks-voices.html`, `tricks-place.html`), with the candidate recordings in `sounds/` beside them.
Builds on: `2026-10-04-motion-and-ux-design.md` (themes, motion, moments)

## 1. Purpose

Tricks has three themes. Modern and Minimal are near each other and bland; Retro is pixel type on green felt. Balatro was the reference for what "really pop" means. This design keeps what Balatro does and leaves what it looks like, and commits the whole app to one look of our own, with a sound layer to match.

What is kept from Balatro: one committed world with no second theme; the cards as the brightest thing on screen; a table that is alive and reacts to the game; every action landing with weight. What is left behind: the CRT scanlines, the paint swirl, the pixel font and the slate chips. Those are its surface, and copying them would make an imitation.

### Decisions

| Question | Decision |
|---|---|
| Direction | **Sunburst**: a deck of cards is ink on paper, so the whole app is print. Four inks, fat lettering, rays that turn behind the trick. A second direction, Pocket (retro as a pocket console, dithered and sprite-stepped), was mocked up and not chosen: closer to Balatro, and pixel type is hard going for the coach's paragraphs. |
| Themes | One look. Modern, Minimal and Retro go. The "Look" picker becomes a choice of table colour and card back within Sunburst. Saved theme ids that no longer exist fall back to the default, as `currentTheme` already does. |
| Sounds | Recorded, never synthesised: the current tones and noise bursts go. Real cards, wood, a desk bell, rubber stamps, poker chips, from CC0 recordings (section 4). |
| Voices | The calls and the table's reactions are real South African voices, recorded by Arjun and friends (section 5). Until the recordings exist, the recorded foley stands in for them. |
| Music | None. A low ambience bed from Durban recordings, optional, instead (section 6). |

## 2. The look

**Inks.** Paper `#f6eedb`, ink `#1e1a17`, red `#e2412e`, blue `#2850d8`, yellow `#f8b81c`: the four inks of a court card, on card stock. The table is a green outside that set, `#0d7a62` with rays in `#12896f`. Other tables are the same look over another colour.

**Type.** Shrikhand for the wordmark, panel titles and the calls as they land, a face drawn after hand-painted Indian street lettering. Archivo (variable width and weight) for everything else: body text, card indices (900, narrowed), scoreboard numerals (900, 70% width), tags and buttons. Two families, clearly distinct, both from Google Fonts; the Press Start 2P, VT323, Bricolage, Figtree and Hanken loads go.

**The table.** A sunburst of rays turning slowly behind the trick, centred on it, so the rays point at the play; halftone dots grow toward the edges. It is a small WebGL shader over a fallback gradient, capped at 1.5× device pixels and 30 frames a second, still under reduced motion and when the tab is hidden. It reads the ray colours from the theme's tokens. A moment with the `call` tone (Thunee, Jodhi, Double, Khanaak) floods the rays orange and spins them for its duration; one with the `danger` tone (a challenge, a verdict) floods them red. The shell does this from the moment's tone, so it knows no game.

**Chrome.** Paper plates with a 2px ink border, 9–12px radius, and a solid offset plate behind in a spot colour (yellow for play, red for danger, blue for information), outlined in ink. Buttons are paper with a 4px ink drop that presses flat; the primary action is yellow with ink text, danger is red with paper text, quiet buttons are outlined in paper on the table. On-table text is paper, with "Your turn" in yellow. Seat names are ink pills, the one to play in yellow; the dealer is a small outlined tag.

**Scoreboard.** Two tickets at the top: a coloured numeral block (yellow on the left, blue on the right) with the team name and a 6×2 dot track of the balls beside it, Menu between them.

**Cards.** Paper face, 1.5px ink border, 7px radius, a solid translucent shadow. Index top-left in Archivo 900 with a small pip; number cards carry one large pip lower right. Court cards wear a patterned panel beside the index, cut from the four inks: the King in stripes, the Queen in a lattice, the Jack in dots, with the pip on a paper disc. Suit pips are inline SVG, not text glyphs, so they match on every phone. Cards on the table land with a few degrees of random tilt; a won trick gets a yellow starburst behind the winning card. The card back is a red lattice on paper inside an ink border.

**Calls.** A call takes the screen as lettering: the word in Shrikhand, yellow with an ink stroke and an ink block shadow, rotated, stamped in with an overshoot, over a ribbon with the detail. The table content dims to a fifth while it is up.

**Motion.** An ease with a little overshoot on a fixed 220 ms clock for cards and panels (a spring's settle held played cards in the hand for most of a second, which the browser scripts caught); the stamp for calls; the rays for mood. No idle motion on the cards. Reduced motion keeps fades and drops travel, as now.

**Known bug to fix in the pass.** `.display` sets `font-size` from `--display-scale`, which overrides Tailwind's size utilities, so the Tricks wordmark and game names render tiny.

## 3. What changes in the code

- `src/themes/tokens.css` and `index.ts`: one token set with table-colour variants; one motion transition for every table. `index.html` loads the two fonts and sets the chrome colour.
- `src/index.css`: panels, buttons, cards, bubbles, moments, toasts and the scoreboard restyled on the new tokens. Court patterns and pips come from `src/ui/Card.tsx`.
- A background painter, `src/themes/felt.ts`, mounted once by the shell, reading its colours from the tokens and its mood from the moment layer.
- `ThemePicker` offers tables and card backs.
- The rest of the rules in `AGENTS.md` hold: tokens only in components, events drive sounds and moments, the shell names no game.

## 4. Sounds

Every sound is a gesture at a real table or an object from the print world; nothing is a tone. Louder as it matters more: buttons soft, cards medium, a call fills the room. Each play varies a few percent in pitch so no two are the same. Nothing plays between events.

| Event | Sound | Placeholder recording |
|---|---|---|
| Cards dealt | the deck riffled, then squared | Kenney `card-shuffle`, cut at 1.3 s |
| A card played | a card put down | Kenney `card-place-2` |
| A Jack (Thunee), the queen of spades (Hearts) | the card slammed | Kenney `card-place-3` + `impactWood_light_000` |
| Your turn | knock knock on the wood | Kenney `impactWood_light_000`, `_001` at 150 ms |
| Trick won | the trick gathered in; quieter when not yours | Kenney `card-shove-2` |
| A call for trump | one knock | Freesound 388269 |
| Thunee, Double, Khanaak | a slam on the desk | Freesound 718357 |
| Jodhi | the cards fanned | Kenney `card-fan-1` |
| A challenge | three knocks | Freesound 388269 ×3 |
| Challenge upheld | a rubber stamp | Freesound 362624 |
| Challenge fails | a desk bell | Freesound 685111, cut at 1.4 s |
| Each ball | a poker chip laid | Freesound 817552–817554 |
| Game won | the pot pushed over, and the table cheering for the side that won; the pot alone for the other | Freesound 532861, 505717 |
| A committing button (sit, start, deal, call) | a page turned, soft | Kenney `bookFlip1`, cut at 350 ms |

Arjun approved the table and button sounds. The call and score rows are second-round candidates he had not settled on; they stand in until the voices arrive. All recordings are CC0 (Kenney packs; Freesound ids as listed, previews used as-is). The files go in `public/sounds/` as mono mp3, with a `SOURCES.txt`. `src/ui/sound.ts` keeps its `Sound` names and mute switch, plays decoded buffers through Web Audio with a random `playbackRate` of ±4%, and layers parts with offsets. Haptics pair with the knock, the slam and each chip.

Crowd reactions (gasps, laughs, applause from recordings) were tried and rejected: the wrong kind of human.

## 5. Voices

The calls in the caller's voice, and the table answering in the players' own. Three or four people each record one call sheet: the calls (Thunee!, Double!, Khanaak!, Jodhi!), the table (Yoh!, Haibo!, Ekse!, Eish!, Aweh!, Lekker!, a laugh) and the numbers (ten to a hundred and four, and Pass), three takes each. The sheet, with a recorder that downloads one zip per person, is `tricks-voices.html` in the artifacts folder.

| Moment | Who speaks | What |
|---|---|---|
| Thunee, Double, Khanaak, Jodhi | the caller's voice, as the lettering lands; a beat later one other voice | the word; then Yoh! or Haibo! |
| A call for trump | the caller | the number; Pass said flat |
| A Jack slammed | one voice, now and then | Yoh! |
| A challenge | the challenger | Ekse! or Haibo! |
| Caught | the table, then the guilty one | a laugh; Eish! |
| Challenge fails | the challenger | Eish! |
| Balls won | your side; the other side | Aweh!; Eish! |
| Game won | the table | Lekker!, with a few claps |

Each computer seat gets one person's voice for a whole game, so its calls sound like one player; the table's answers come from the others, never the one who called. A take is chosen at random from the person's three. A toggle beside "Sound on" turns the voices off, for a room where four humans are already reacting. Until the recordings exist, section 4's placeholders play for these moments.

## 6. Music

None during play. People talk over Thunee; a loop competes with them and is muted within a week, and one loop forces one mood on a game that swings between calm and rowdy. The visual equivalent of Balatro's responsive music is the rays changing with the game.

Instead, a place: a low ambience bed of real Durban recordings (the beachfront, crickets, a hadeda call every couple of minutes; a street for the lobby), CC0 from Freesound, levelled to sit far under the foley. Off by default in a room with other humans, on in practice and computer games, with a switch beside the sound ones. Loops are 30–60 s so the join is not heard twice in a row; the hadeda is never during a decision. A short musical phrase at game start and at game won is the only music worth adding later, and only if it can be recorded with the same grain as the voices.
