569 decisions with two or more legal cards from 40 heuristic rounds, search:random:30

- legal cards per decision: mean 3.29
- best card ahead of the next best by more than two standard errors, in balls: 53 (9%)
- best and next best exactly level in balls (decided by card points): 280 (49%)
- gap to the next best, balls: median 0.067, 90th percentile 0.400
- gap to the next best, card points: median 7.3, 90th percentile 44.0
- search and heuristic differ: 282 (50%); of those the heuristic's card is worse by more than two standard errors in balls: 35
- cost of the heuristic's card when they differ, balls: median 0.100, mean 0.205; card points: median 8.3

## 4 examples (evenly spaced)

```
seat 3, trick 1, trumper 2, trump hidden, on the table: (leading), hand: 9♠ 9♣ 10♥ K♣ 9♦ K♠
9♣   balls   1.70  points    23.6  wins trick  20% (team  50%)
K♣   balls   1.50  points     5.3  wins trick   0% (team  37%)  <- heuristic
9♦   balls   1.40  points    -5.7  wins trick  33% (team  57%)
9♠   balls   1.30  points    35.0  wins trick  40% (team  67%)
10♥  balls   1.30  points   -29.9  wins trick   7% (team  33%)
K♠   balls   1.20  points   -14.8  wins trick   0% (team  50%)
gap to next best: 0.200 balls (se 0.139), 18.3 points (se 18.2)
```
```
seat 3, trick 5, trumper 3, trump spades, on the table: (leading), hand: J♠ 9♥
9♥   balls  -2.00  points    43.8  wins trick   0% (team  10%)  <- heuristic
J♠   balls  -2.00  points    31.1  wins trick 100% (team 100%)
gap to next best: 0.000 balls (se 0.000), 12.7 points (se 7.6)
```
```
seat 0, trick 5, trumper 2, trump spades, on the table: A♦ A♥, hand: K♥ 10♣
K♥   balls  -0.30  points    95.0  wins trick   0% (team  63%)  <- heuristic
10♣  balls  -0.80  points    95.9  wins trick   0% (team  63%)
gap to next best: 0.500 balls (se 0.208), -0.9 points (se 1.6)
```
```
seat 2, trick 1, trumper 1, trump hidden, on the table: (leading), hand: 9♦ 10♣ K♥ K♦ Q♣ A♠
A♠   balls   1.20  points   -51.7  wins trick  20% (team  47%)
K♦   balls   1.10  points   -38.9  wins trick   0% (team  23%)
K♥   balls   1.10  points   -76.4  wins trick   0% (team  40%)
9♦   balls   1.00  points   -30.1  wins trick  37% (team  60%)
10♣  balls   0.70  points   -93.0  wins trick   0% (team  43%)
Q♣   balls   0.60  points   -84.9  wins trick   0% (team  43%)  <- heuristic
gap to next best: 0.100 balls (se 0.305), -12.9 points (se 21.7)
```
