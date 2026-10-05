569 decisions with two or more legal cards from 40 heuristic rounds, search:random:100

- legal cards per decision: mean 3.29
- best card ahead of the next best by more than two standard errors, in balls: 103 (18%)
- best and next best exactly level in balls (decided by card points): 227 (40%)
- gap to the next best, balls: median 0.040, 90th percentile 0.360
- gap to the next best, card points: median 6.1, 90th percentile 40.1
- search and heuristic differ: 266 (47%); of those the heuristic's card is worse by more than two standard errors in balls: 59
- cost of the heuristic's card when they differ, balls: median 0.060, mean 0.163; card points: median 5.6

## 8 examples (evenly spaced)

```
seat 3, trick 1, trumper 2, trump hidden, on the table: (leading), hand: 9♠ 9♣ 10♥ K♣ 9♦ K♠
9♠   balls   1.28  points    -4.9  wins trick  38% (team  64%)
9♣   balls   1.28  points   -13.4  wins trick  22% (team  48%)
K♣   balls   1.22  points   -17.7  wins trick   0% (team  33%)  <- heuristic
10♥  balls   1.16  points   -28.6  wins trick   3% (team  29%)
K♠   balls   1.07  points   -24.4  wins trick   0% (team  43%)
9♦   balls   1.01  points   -36.0  wins trick  41% (team  59%)
gap to next best: 0.000 balls (se 0.135), 8.5 points (se 12.2)
```
```
seat 3, trick 5, trumper 1, trump clubs, on the table: (leading), hand: 9♦ A♦
9♦   balls  -0.35  points   141.4  wins trick   6% (team  37%)
A♦   balls  -0.35  points   140.2  wins trick   6% (team  37%)  <- heuristic
gap to next best: 0.000 balls (se 0.000), 1.3 points (se 1.2)
```
```
seat 3, trick 5, trumper 3, trump spades, on the table: (leading), hand: J♠ 9♥
9♥   balls  -2.00  points    57.9  wins trick   0% (team  23%)  <- heuristic
J♠   balls  -2.00  points    32.0  wins trick 100% (team 100%)
gap to next best: 0.000 balls (se 0.000), 25.9 points (se 5.1)
```
```
seat 2, trick 3, trumper 0, trump spades, on the table: 10♦ 10♠, hand: K♣ A♣ 10♣ 9♣
K♣   balls  -1.43  points   -19.2  wins trick   0% (team   0%)  <- heuristic
10♣  balls  -1.43  points   -24.0  wins trick   0% (team   0%)
A♣   balls  -1.43  points   -24.6  wins trick   0% (team   0%)
9♣   balls  -1.43  points   -28.8  wins trick   0% (team   0%)
gap to next best: 0.000 balls (se 0.000), 4.9 points (se 0.8)
```
```
seat 0, trick 5, trumper 2, trump spades, on the table: A♦ A♥, hand: K♥ 10♣
K♥   balls  -0.53  points    85.8  wins trick   0% (team  66%)  <- heuristic
10♣  balls  -0.98  points    88.2  wins trick   0% (team  66%)
gap to next best: 0.450 balls (se 0.108), -2.4 points (se 0.9)
```
```
seat 0, trick 5, trumper 2, trump hearts, on the table: K♦, hand: 9♦ A♦
9♦   balls  -2.00  points  -114.3  wins trick   0% (team  52%)
A♦   balls  -2.00  points  -114.5  wins trick   0% (team  52%)  <- heuristic
gap to next best: 0.000 balls (se 0.000), 0.2 points (se 1.3)
```
```
seat 2, trick 1, trumper 1, trump hidden, on the table: (leading), hand: 9♦ 10♣ K♥ K♦ Q♣ A♠
K♦   balls   1.01  points   -51.2  wins trick   0% (team  35%)
A♠   balls   0.98  points   -59.7  wins trick  14% (team  43%)
K♥   balls   0.95  points   -63.0  wins trick   0% (team  30%)
9♦   balls   0.86  points   -44.7  wins trick  29% (team  53%)
Q♣   balls   0.86  points   -67.5  wins trick   0% (team  40%)  <- heuristic
10♣  balls   0.83  points   -67.5  wins trick   0% (team  40%)
gap to next best: 0.030 balls (se 0.151), 8.5 points (se 11.7)
```
```
seat 2, trick 1, trumper 2, trump diamonds, on the table: Q♥ K♦ A♥, hand: 10♦ A♦ J♥ J♠ Q♣ 10♥
10♥  balls  -0.56  points   114.6  wins trick   0% (team 100%)
J♥   balls  -0.71  points    91.7  wins trick   0% (team 100%)  <- heuristic
gap to next best: 0.150 balls (se 0.108), 22.9 points (se 6.9)
```
