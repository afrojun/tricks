 23:04:35 up 18 days,  4:59,  7 users,  load average: 14.82, 16.55, 13.93
286 decisions with two or more legal cards, from 20 heuristic rounds (seeds 1-20)
legal cards per decision: mean 3.36, max 6

## Per decision, in place (no cloning)

| Policy | Worlds | Median ms | p95 ms | Max ms |
|---|---|---|---|---|
| random | 10 | 3.9 | 14.1 | 21.8 |
| random | 30 | 10.0 | 27.3 | 68.6 |
| random | 100 | 34.5 | 99.4 | 516.3 |
| heuristic | 10 | 7.7 | 25.8 | 36.9 |
| heuristic | 30 | 36.0 | 279.6 | 968.1 |
| heuristic | 100 | 171.4 | 1207.5 | 3108.2 |

## Calling, trump and Thunee by search, in place: 42 decisions

| Policy | Worlds | Median ms | p95 ms | Max ms |
|---|---|---|---|---|
| random | 10 | 12.1 | 28.1 | 32.9 |
| random | 30 | 28.1 | 59.0 | 70.9 |
| random | 100 | 102.8 | 393.8 | 559.1 |
| heuristic | 10 | 11.6 | 27.6 | 35.6 |
| heuristic | 30 | 42.5 | 93.3 | 104.3 |
| heuristic | 100 | 154.0 | 497.2 | 1118.9 |

## Per decision with the engine's cloning apply

| Policy | Worlds | Median ms | p95 ms | Share of time in structuredClone | Clones per decision | In place is faster by |
|---|---|---|---|---|---|---|
| random | 10 | 129.7 | 649.9 | 90% | 689 | 24.83x |
| random | 30 | 345.4 | 1355.7 | 92% | 2067 | 28.21x |
| heuristic | 10 | 61.0 | 195.7 | 88% | 694 | 16.89x |
| heuristic | 30 | 172.6 | 560.2 | 90% | 2082 | 14.65x |

## Where the time goes, 30 worlds

- random: knowledge 0.5%, sampling 4.6%, rebuild 13.8%, rollouts 81.2%
- random rollouts: engine apply with cloning 74.29 s; in place 2.89 s (25.74x faster); in place without re-validating 1.58 s (46.87x)
- heuristic: knowledge 0.3%, sampling 2.6%, rebuild 8.4%, rollouts 88.7%
- heuristic rollouts: engine apply with cloning 68.78 s; in place 4.44 s (15.48x faster); in place without re-validating 3.11 s (22.12x)
 23:20:17 up 18 days,  5:15,  7 users,  load average: 2.84, 8.04, 12.02
