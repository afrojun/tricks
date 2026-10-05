/** Deals the computer players' tests share. Each is thirteen cards for seats 0 to 3. Not used by the app. */

/**
 * Seat 3 runs spades until seat 1 holds the last one, the ace; then seat 3
 * leads the king and seat 0 drops the queen under it (`TO_THE_QUEEN`). Seat 1
 * holds nothing else but diamonds; seat 2 is void in spades after the first
 * round of them.
 */
export const SLY = [
  '2c 3c 4c Qs 2s 3s 4s 2d 3d 4d 5d 2h 3h',
  '5c As 5s 6s 7s 6d 7d 8d 9d 10d Jd Qd Kd',
  '6c 8s Ad 4h 5h 6h 7h 8h 9h 10h Jh Qh Kh',
  'Ac Ks 9s 10s Js 7c 8c 9c 10c Jc Qc Kc Ah',
]
export const TO_THE_QUEEN = '2c 5c 6c Ac  9s 4s 7s 8s  10s 3s 6s Ad  Js 2s 5s 4h  Ks Qs'

/** `SLY` before passing left: seat 0 gives seat 1 the ace of spades, so seat 0 knows where it is. */
export const SLY_BEFORE_PASSING = [
  '2c 3c 4c Qs 2s 3s 4s 4d 5d 3h As 6d 7d',
  '5c 5s 6s 7s 8d 9d 10d Jd Qd Kd 8s Ad 4h',
  '6c 5h 6h 7h 8h 9h 10h Jh Qh Kh 7c 8c Ah',
  'Ac Ks 9s 10s Js 9c 10c Jc Qc Kc 2d 3d 2h',
]
export const SLY_PASSES = ['As 6d 7d', '8s Ad 4h', '7c 8c Ah', '2d 3d 2h']

/**
 * Without passing, seat 2 holds no clubs or diamonds and seat 1 no diamonds.
 * With `SUSPECT_PLAY`, seat 2 shows out of clubs on the first trick, then out
 * of diamonds on the second, just after seat 1 throws the queen on it.
 */
export const SUSPECT = [
  '2c 3c 4c 5c 6c 2d 3d 4d 5d 6d 2s 3s 4s',
  '7c 8c 9c 10c Qs 2h 3h 4h 5h 5s 6s 7s 8s',
  '6h 7h 8h 9h 10h Jh Qh Kh 9s 10s Js Ks As',
  'Jc Qc Kc Ac 7d 8d 9d 10d Jd Qd Kd Ad Ah',
]
export const SUSPECT_PLAY = '2c 7c 9s Ac  7d 2d Qs 6h'
