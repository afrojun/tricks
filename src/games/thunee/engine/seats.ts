/** Seats come from the kit, numbered in play order; Thunee pairs them into teams as the kit's partnerships. */
export { type Seat, allSeats, seatsFrom } from '../../../kit/table'
export { type Team, otherTeam, partnerOf, teamOf } from '../../../kit/partners'
/** Play runs counterclockwise; the next seat is the one to the right. */
export { nextSeat as next } from '../../../kit/table'
