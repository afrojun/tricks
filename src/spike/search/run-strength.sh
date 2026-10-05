#!/bin/sh
# Section 3.1: every budget and rollout policy against the heuristic, 1,000 duplicate pairs each (seeds 1-1000).
#   sh src/spike/search/run-strength.sh
cd "$(dirname "$0")/../../.." || exit 1
for policy in random heuristic; do
  for worlds in 10 30 100; do
    ./node_modules/.bin/tsx src/spike/search/strength.ts --a "search:$policy:$worlds" --b heuristic --pairs 1000 --shards "${SHARDS:-6}" | tail -1
  done
done
