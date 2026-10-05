#!/bin/sh
# Section 3.3: 1,000 rounds (seeds 20001-21000) in each design, every rebuilt world checked.
#   sh src/spike/search/run-cheating.sh
# cheats:   Wild (1) and Sly (3) cheat and challenge as their personas do; 0 and 2 never challenge.
# unchallenged: the same cheats, but nobody challenges, so every round is decided by play.
# honest:   the control, all four Straight and nobody challenges.
cd "$(dirname "$0")/../../.." || exit 1
c() { ./node_modules/.bin/tsx src/spike/search/cheating.ts --rounds 1000 --shards "${SHARDS:-6}" "$@" | tail -1; }
for spec in search:random:30 search:random:10 search:heuristic:30; do
  c --a "$spec" --tag cheats
  c --a "$spec" --tag unchallenged --cheatsChallenge false
  c --a "$spec" --tag honest --cheatsChallenge false --personas straight,straight,straight,straight
done
