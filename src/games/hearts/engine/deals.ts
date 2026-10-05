/** Deals the tests share. Each is thirteen cards for seats 0 to 3. Not used by the app. */

/** Every seat holds every suit but seat 1, which holds no clubs and holds the queen of spades. */
export const VOID = [
  '2c 3c 4c 5c 6c 7c 8c 2d 3d 2s 3s 2h 3h',
  '4d 5d 6d 7d 4s 5s 6s 7s Qs 4h 5h 6h 7h',
  '9c 10c Jc 8d 9d 10d Jd 8s 9s 10s 8h 9h 10h',
  'Qc Kc Ac Qd Kd Ad Js Ks As Jh Qh Kh Ah',
]

/** Seat 1 wins the first trick with the ace of clubs and then leads, holding the queen of spades and six hearts. */
export const LEAD = [
  '2c 3c 4c 5c 2d 3d 4d 2s 3s 4s 2h 3h 4h',
  'Ac 5d 6d 7d Qs 5s 6s 5h 6h 7h 8h 9h 10h',
  '6c 7c 8c 9c 10c 8d 9d 10d 7s 8s 9s Jh Qh',
  'Jc Qc Kc Jd Qd Kd Ad 10s Js Ks As Kh Ah',
]

/** One suit each: seat 0 leads clubs every trick, wins them all, and shoots the moon. */
export const MOON = [
  '2c 3c 4c 5c 6c 7c 8c 9c 10c Jc Qc Kc Ac',
  '2d 3d 4d 5d 6d 7d 8d 9d 10d Jd Qd Kd Ad',
  '2s 3s 4s 5s 6s 7s 8s 9s 10s Js Qs Ks As',
  '2h 3h 4h 5h 6h 7h 8h 9h 10h Jh Qh Kh Ah',
]

/** Seat 1 wins the first trick with the ace of clubs and is left with nothing but hearts. */
export const ALL_HEARTS = [
  '2c 3c 4c 5c 6c 7c 8c 9c 10c Jc Qc 2d 3d',
  'Ac 2h 3h 4h 5h 6h 7h 8h 9h 10h Jh Qh Kh',
  'Kc Ah 4d 5d 6d 7d 8d 9d 10d Jd Qd Kd Ad',
  '2s 3s 4s 5s 6s 7s 8s 9s 10s Js Qs Ks As',
]

/** Seat 1 holds no clubs and nothing but hearts and the queen of spades. */
export const ALL_POINTS = [
  '2c 3c 4c 5c 6c 7c 8c 9c 10c Jc Qc Kc Ac',
  '2h 3h 4h 5h 6h 7h 8h 9h 10h Jh Qh Kh Qs',
  'Ah 2d 3d 4d 5d 6d 7d 8d 9d 10d Jd Qd Kd',
  'Ad 2s 3s 4s 5s 6s 7s 8s 9s 10s Js Ks As',
]

/** High and low cards spread round the table: played out with the first legal card, nobody shoots the moon. */
export const SPREAD = [
  '2c 6c 10c Ac 5d 9d Kd 4s 8s Qs 3h 7h Jh',
  '3c 7c Jc 2d 6d 10d Ad 5s 9s Ks 4h 8h Qh',
  '4c 8c Qc 3d 7d Jd 2s 6s 10s As 5h 9h Kh',
  '5c 9c Kc 4d 8d Qd 3s 7s Js 2h 6h 10h Ah',
]

/**
 * Seat 3 shoots the moon but seat 1 takes the jack of diamonds. Played with
 * `MOON_JACK_PLAY`: seat 3 wins the opening trick, loses a pointless diamond
 * trick to the jack, takes the lead back with the king of clubs, then wins
 * every point.
 */
export const MOON_JACK = [
  '2c 7c 8c 9c 10c Jc Qc 3d 5d 2s 4s 2h 5h',
  '3c 5c 6d 7d 8d 9d 10d Jd Qd 3s 5s 3h 6h',
  '4c 6c 4d Kd Ad 6s 7s 8s 9s 10s Js Qs 4h',
  'Ac Kc 2d As Ks Ah Kh Qh Jh 10h 9h 8h 7h',
]
export const MOON_JACK_PLAY =
  '2c 3c 4c Ac  2d 3d Jd 4d  5c 6c Kc 7c  As 2s 3s Qs  Ks 4s 5s 6s  Ah 2h 3h 4h  Kh 5h 6h 7s ' +
  'Qh 8c 6d 8s  Jh 9c 7d 9s  10h 10c 8d 10s  9h Jc 9d Js  8h Qc 10d Kd  7h 5d Qd Ad'

/** Seat 1 wins the first trick with the ace of clubs and is left with the queen of spades and eleven hearts. */
export const QUEEN_AND_HEARTS = [
  '2c 3c 4c 5c 6c 7c 8c 9c 10c Jc Qc 2d 3d',
  'Ac Qs 2h 3h 4h 5h 6h 7h 8h 9h 10h Jh Qh',
  'Kc Kh Ah 4d 5d 6d 7d 8d 9d 10d Jd Qd Kd',
  'Ad 2s 3s 4s 5s 6s 7s 8s 9s 10s Js Ks As',
]
