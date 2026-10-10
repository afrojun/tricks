# Copy style

**Status:** decided, and the app follows it (2026-10-10). Revised after a first audit of every screen, which settled the earlier open questions from what the copy already does; Arjun decided the last two (section 6).

Every word a player reads in Tricks: buttons, hints over the hand, toasts and moments, refusals, the lobby, the rule books, the coach's notes and lessons, drill briefs and verdicts, the round result, the rules screen, screen-reader labels, and the manifest's name and description. Not code comments or test names.

## 1. The target

**Who reads it.** Friends playing on their phones, often on a video call, some of them learning the game. Thunee's players are mostly South African and know it from the family table; Hearts and Spades players may know the games from elsewhere under other words. Every line is read at arm's length, mid-game, in a glance.

**The voice.** A friend at the table who knows the game well: plain, warm, brief, a little dry. It says what is happening and what you can do, and stops. The colour comes from the table (Yoh, Haibo, the chappal), the look and the sounds, not from the copy: the copy never jokes, cheers or scolds.

**The test.** Read it aloud to someone across the table. If you would not say it that way, rewrite it.

## 2. Rules

1. **Sentence case** for everything: titles, buttons, labels, menu items, toasts, tags. Capitals only for names: the games, the calls (Thunee, Jodhi, Double, Khanaak, Nil, Blind nil), presets (Traditional, Tuscans, Standard, Omnibus), people, and Tricks. Code that builds a line keeps a name's capital ("Learn about Jodhi", never "jodhi") and capitalises a sentence's first word ("Hearts are your longest suit").
2. **Plain words, short sentences.** One idea a sentence. Everyday words over formal ones. No jargon the player has not been taught: the coach introduces a term before relying on it (counting side, bag, backward Khanaak, the stock), and words from the code never reach the screen (server, drawing, partner catch, side suit).
3. **Speak to the player.** "You" and "your"; other players by name; "your partner", "your side". A player whose pronouns are unknown is "they", never "it". Never "the user", "Player 2" or a seat number where a name exists. Every line built from seats says "you" to the seat reading it, mid-sentence in lower case, with the verb agreeing ("You take", "Asha takes"; "Asha has", "Asha and Chan have"). A side of one is spoken of as the player ("you are set", "Asha has made the call"); "your side" is for partners.
4. **Say what happens, then what to do.** A refusal names the problem and the way out ("Take a seat first."), never blames, and never says error, invalid, failed or oops. ("Failed" is fine for a call that did not come off: "Asha's Double failed".) A wait says whom it waits on ("Waiting for Asha to call"), or what will end it when anyone may ("Waiting for someone to press Next round"), never just "Waiting…".
5. **Buttons** say what the press does: a verb ("Start game", "Pass left", "Copy link", "Sit back down"), or the name of what it opens or chooses ("Hint", "House rules", a preset, a persona), or a call's own name ("Jodhi", "Double") with an aria-label "Call Jodhi". Up to three words. A confirmation asks a question and answers in single verbs ("Leave this game?": "Leave", "Stay"), never OK/Cancel or Yes/No. In the challenge sheet, whose title is the verb, a button may state the claim ("Asha broke a rule").
6. **Short enough for the screen.** At 390 px: a button three words; the line over the hand one line (about 32 characters), or two while no hand is in play; a toast or moment one line; a coach note's title five words and its body two sentences (three for a note that reports where the trick stands); a drill brief three; a lesson paragraph four. Where a panel carries the detail, the line over the hand is only the cue ("Your call").
7. **The coach explains, never talks down.** The move and the reason, once, naming the cards ("Play the queen of spades: someone else takes the trick and her 13 points."). No "simply", "obviously", "easy", "great job", "oops", nor "just" as a minimiser ("just as good" is fine). Praise is plain ("Well played"), a miss is plain ("Not quite") and says what would have worked.
8. **Calm, not shouting.** No exclamation marks, except a call as it is made at the table (Thunee!, Nil!) and table talk. No emoji in copy; emotes and throws are pictures.
9. **One name for one thing** (section 3). The term the rule book uses is the term the table, the coach and the result use.
10. **Spelling and typography.** British spelling (colour, centre, towards, practise the verb, practice the noun). Curly apostrophes and quotes (’ “ ”), in template literals too. A true minus (−10, never "minus 10"), an en dash for ranges (1–12). An ellipsis only on a bare noun that would otherwise read as a state ("Drills…", "Edit…"). Colons join a statement to its detail, the house habit: "Your lead: the two of clubs". One colon a line.
11. **Numbers.** Digits for scores, points, balls, bags, targets and anything on the score sheet (13 points, 500, 4 balls, 2 balls to clear). Otherwise words to ten and digits after (pick three cards, two more for Asha, 13 cards each). A number that names a thing rather than counts it may stay in words ("Ten bags", "twelve balls" in a tagline). Ordinals in words in prose (the fifth trick), digits in a label short of space (3rd). Counts agree: "1 bag", "1 second left", always through `plural()`.
12. **Cards and suits.** A card named as a rule or a concept is in words, lower case: the queen of spades, the two of clubs, the jack of diamonds, a low club. A particular card in a hand, on the table or in a verdict may take the short form: Q♠, J♥, 10♦ ("Lead high, K♦"; "4♠ beats the A♣"). Never "Queen of Spades" or "QS". Ranks are lower case in every game (jack, king, queen); 9 and 10 are digits. Suits are lower case in a sentence ("Trump is hearts"). The queen of spades in Hearts is "she". Screen readers get the long form ("queen of spades"). A card's short form shows in its suit's colour wherever copy is rendered, hearts and diamonds red, through `SuitText` (`src/ui/SuitText.tsx`); a screen never prints a copy string that may hold a suit without it.

## 3. Words

| Use | Not | Note |
|---|---|---|
| call | bid | Spades too: you call tricks. Spades' house rule is "Call plus three" in specs and docs |
| contract | | Spades: taught once in the calling lesson; elsewhere "call" ("made its call") |
| side | team | In every game: your side, the other side. Thunee's two are the trumping side and the counting side |
| balls | game points | Thunee's score |
| computer | AI, bot, CPU | "Add computer" |
| tap, press | click | "Press Challenge" |
| trump (the suit), trumps (the cards) | trumps (the suit) | "Spades are trump"; "the king and queen of trump"; "a hand of trumps" |
| trumper | caller (of trump) | Thunee: the one who chose trump. "Caller" is who called Thunee, Double or Khanaak |
| challenge | accuse, call out | the action, the button and the verb ("Asha challenged you") |
| caught, fair play | | a challenge's two verdicts |
| broke a rule, played by the rules | renege, played fair | renege nowhere on screen |
| deal again, dealing again, dealt again | redeal | |
| give away | pass | Hearts: "pass" is only the three-card exchange before play |
| pick | choose | Hearts: you pick three cards, then pass them |
| hold | have | cards are held |
| round | hand (of play), half (with four) | a hand is the cards you hold; Thunee for two has halves |
| game | match, table, room | "Create game", "Game ABCDEF" |
| invite link, code | room ID, URL | the six letters |
| host | owner, admin | |
| away | disconnected, offline | "Asha is away" |
| sit back down | take over | a person taking their seat back |
| play for, stand in | take over, replace | a computer playing for someone away |
| house rules | rules (for the set), settings, variants | the screen, the lobby panel and the rule book. "Rules in this game" for those in force |
| Look, Settings | | the menu's two sections: the table colour; sound and reactions |
| the lead, lead | open | "Your lead" |

## 4. Patterns

- **The line over the hand:** what to do now ("Your lead", "Pick three for Asha", "Call or pass") or whom the table waits on ("Devi to play"). No full stop.
- **Toasts and moments:** one statement of what just happened, past or present ("Hearts are broken", "Asha called Thunee"). No full stop on a fragment; a full stop on a sentence. A line every seat sees is true for every seat ("The counting side holds no trump", never "the other side").
- **Refusals:** one sentence with a full stop, the problem in the player's terms ("That card isn’t in your hand.").
- **Empty states:** what will appear and when ("The last trick shows here once one is won.").
- **Labels and rule names:** a noun phrase in sentence case, no full stop; a choice is a short phrase that reads after the label ("Last trick: Winner gains 10"). A choice says what it means; "Strict" alone does not.
- **Tags under a name:** one word or two, sentence case ("Sharp", "Away", "Computer playing").
- **Coach:** title a short fragment, body full sentences, second person, present tense. A note about a challenge names both players ("Asha challenges Devi").
- **Closing a sheet:** "Close" or "Got it" for a sheet opened from the table; "Back to …" for one opened from another sheet.
- **Contractions:** short lines the table says to you (refusals, toasts, hints, status) contract ("isn’t", "can’t"); the coach's notes and lessons keep the full form ("cannot", "do not"), the calm of a teacher. Within a surface, one or the other.

## 5. Out of scope

The table words (Yoh, Haibo, Ekse, Eish, Aweh, Lekker) are fixed by the voice sheet. Code identifiers, comments and specs follow the repository's own style, not this one.

## 6. Decided

Arjun settled the two questions the audit left (2026-10-10):

1. **How a computer is marked.** Computers have plain names from `AI_NAMES` (`src/kit/table.ts`), and the seat's tag row says "Computer" at all times ("Sharp computer" when the persona shows). The name is never the marker.
2. **Practice names.** Practice computers draw names as a room's do; the coach says where a seat sits where it matters ("Asha, on your right").
