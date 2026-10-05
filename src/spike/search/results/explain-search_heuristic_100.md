569 decisions with two or more legal cards from 40 heuristic rounds, search:heuristic:100

- legal cards per decision: mean 3.29
- best card ahead of the next best by more than two standard errors, in balls: 128 (22%)
- best and next best exactly level in balls (decided by card points): 253 (44%)
- gap to the next best, balls: median 0.030, 90th percentile 0.360
- gap to the next best, card points: median 4.3, 90th percentile 33.5
- search and heuristic differ: 314 (55%); of those the heuristic's card is worse by more than two standard errors in balls: 94
- cost of the heuristic's card when they differ, balls: median 0.060, mean 0.182; card points: median 5.1

## 8 examples (evenly spaced)

```
seat 3, trick 1, trumper 2, trump hidden, on the table: (leading), hand: 9♠ 9♣ 10♥ K♣ 9♦ K♠
K♣   balls   1.10  points   -37.7  wins trick   0% (team  27%)  <- heuristic
9♦   balls   1.01  points   -47.6  wins trick  13% (team  25%)
10♥  balls   0.99  points   -45.4  wins trick   0% (team  30%)
K♠   balls   0.93  points   -35.7  wins trick   0% (team  33%)
9♣   balls   0.86  points   -47.9  wins trick  11% (team  26%)
9♠   balls   0.86  points   -55.5  wins trick  11% (team  30%)
gap to next best: 0.090 balls (se 0.156), 9.8 points (se 8.5)
```
```
seat 3, trick 5, trumper 1, trump clubs, on the table: (leading), hand: 9♦ A♦
A♦   balls  -0.02  points   147.4  wins trick   0% (team  31%)  <- heuristic
9♦   balls  -0.02  points   145.4  wins trick   0% (team  31%)
gap to next best: 0.000 balls (se 0.000), 2.0 points (se 1.4)
```
```
seat 3, trick 5, trumper 3, trump spades, on the table: (leading), hand: J♠ 9♥
9♥   balls  -2.00  points    51.4  wins trick   0% (team  12%)  <- heuristic
J♠   balls  -2.00  points    17.5  wins trick 100% (team 100%)
gap to next best: 0.000 balls (se 0.000), 33.9 points (se 3.3)
```
```
seat 2, trick 3, trumper 0, trump spades, on the table: 10♦ 10♠, hand: K♣ A♣ 10♣ 9♣
K♣   balls  -1.34  points    -4.3  wins trick   0% (team   0%)  <- heuristic
10♣  balls  -1.34  points   -11.3  wins trick   0% (team   0%)
A♣   balls  -1.34  points   -11.6  wins trick   0% (team   0%)
9♣   balls  -1.43  points   -17.9  wins trick   0% (team   0%)
gap to next best: 0.000 balls (se 0.000), 7.0 points (se 0.7)
```
```
seat 0, trick 5, trumper 2, trump spades, on the table: A♦ A♥, hand: K♥ 10♣
K♥   balls  -0.05  points    79.4  wins trick   0% (team  34%)  <- heuristic
10♣  balls  -0.98  points    75.1  wins trick   0% (team  34%)
gap to next best: 0.930 balls (se 0.139), 4.3 points (se 0.7)
```
```
seat 0, trick 5, trumper 2, trump hearts, on the table: K♦, hand: 9♦ A♦
9♦   balls  -2.00  points  -123.5  wins trick   0% (team  52%)
A♦   balls  -2.00  points  -126.9  wins trick   0% (team  52%)  <- heuristic
gap to next best: 0.000 balls (se 0.000), 3.4 points (se 1.2)
```
```
seat 2, trick 1, trumper 1, trump hidden, on the table: (leading), hand: 9♦ 10♣ K♥ K♦ Q♣ A♠
K♦   balls   1.07  points   -60.9  wins trick   0% (team  26%)
9♦   balls   0.92  points   -72.0  wins trick   9% (team  24%)
A♠   balls   0.86  points   -64.3  wins trick   4% (team  30%)
10♣  balls   0.80  points   -59.8  wins trick   0% (team  34%)
Q♣   balls   0.77  points   -59.3  wins trick   0% (team  37%)  <- heuristic
K♥   balls   0.65  points   -62.4  wins trick   0% (team  27%)
gap to next best: 0.150 balls (se 0.089), 11.1 points (se 6.2)
```
```
seat 2, trick 1, trumper 2, trump diamonds, on the table: Q♥ K♦ A♥, hand: 10♦ A♦ J♥ J♠ Q♣ 10♥
10♥  balls  -0.59  points   102.5  wins trick   0% (team 100%)
J♥   balls  -0.80  points    90.7  wins trick   0% (team 100%)  <- heuristic
gap to next best: 0.210 balls (se 0.107), 11.7 points (se 6.7)
```
