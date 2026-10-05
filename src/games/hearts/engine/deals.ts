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
