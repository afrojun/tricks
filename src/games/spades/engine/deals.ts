/** Deals the tests share. Not used by the app. */

/**
 * Four hands. Seat 0 holds the top three spades and low cards; seat 3 the low spades and the side aces. Each
 * holds every suit.
 */
export const FOUR = [
  'As Ks Qs 2c 3c 4c 5c 2d 3d 4d 2h 3h 4h',
  'Js 10s 9s 6c 7c 8c 9c 5d 6d 7d 5h 6h 7h',
  '8s 7s 6s 10c Jc Qc 8d 9d 10d Jd 8h 9h 10h',
  '5s 4s 3s 2s Kc Ac Qd Kd Ad Jh Qh Kh Ah',
]

/** Seat 1 holds no clubs and four spades. */
export const VOID = [
  '2c 3c 4c 5c 6c 7c 8c 2d 3d 4d 2h 3h 4h',
  'As Ks Qs Js 5d 6d 7d 8d 5h 6h 7h 8h 9h',
  '9c 10c Jc 10s 9s 8s 9d 10d Jd 10h Jh Qh Kh',
  'Qc Kc Ac 7s 6s 5s 4s 3s 2s Qd Kd Ad Ah',
]

/** Seat 0 holds nothing but spades. */
export const ALL_SPADES = [
  'As Ks Qs Js 10s 9s 8s 7s 6s 5s 4s 3s 2s',
  '2c 3c 4c 5c 6c 7c 8c 2d 3d 4d 5d 6d 7d',
  '9c 10c Jc Qc Kc Ac 8d 9d 10d Jd Qd Kd Ad',
  '2h 3h 4h 5h 6h 7h 8h 9h 10h Jh Qh Kh Ah',
]

/** Three hands of seventeen; the two of clubs is left over, so the three of clubs leads. Seat 2 holds it. */
export const THREE = [
  'As Ks Qs Js 10s 4c 5c 6c 2d 3d 4d 5d 6d 2h 3h 4h 5h',
  '9s 8s 7s 6s 7c 8c 9c 10c 7d 8d 9d 10d 6h 7h 8h 9h 10h',
  '5s 4s 3s 2s 3c Jc Qc Kc Ac Jd Qd Kd Ad Jh Qh Kh Ah',
]

/** Two hands of thirteen; the other twenty-six cards are the discards. */
export const TWO = ['As Ks Qs 2c 3c 4c 5c 2d 3d 4d 2h 3h 4h', 'Js 10s 9s 6c 7c 8c 9c 5d 6d 7d 5h 6h 7h']

/** The Jokers deck: seat 1 holds both jokers, seat 2 the two of diamonds and the three of clubs. */
export const JOKERS = [
  'As Ks Qs 4c 5c 6c 7c 3d 4d 5d 3h 4h 5h',
  'BJ LJ Js 10s 8c 9c 10c 6d 7d 8d 6h 7h 8h',
  '2d 9s 8s 7s 3c Jc Qc 9d 10d Jd 9h 10h Jh',
  '2s 6s 5s 4s 3s Kc Ac Qd Kd Ad Qh Kh Ah',
]
