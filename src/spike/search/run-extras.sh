#!/bin/sh
# Follow-up strength runs, each on duplicate deals (seeds 1-1000 unless noted).
#   sh src/spike/search/run-extras.sh
cd "$(dirname "$0")/../../.." || exit 1
s() { ./node_modules/.bin/tsx src/spike/search/strength.ts --shards "${SHARDS:-6}" "$@" | tail -1; }
# Harness sanity: search against itself must come out level.
s --a search:random:10 --b search:random:10 --pairs 1000
# Rulings: the card-point tiebreak, and honest Jodhi claims inside random rollouts.
s --a search:random:30:notie --b heuristic --pairs 1000
s --a search:randomClaims:30 --b heuristic --pairs 1000
# Rollout policies head to head at the same budget.
s --a search:heuristic:30 --b search:random:30 --pairs 1000
# The optional extension: calling, trump and Thunee by search, against the same search for card play only.
s --a search:random:30:early --b search:random:30 --pairs 500
s --a search:heuristic:30:early --b search:heuristic:30 --pairs 500
