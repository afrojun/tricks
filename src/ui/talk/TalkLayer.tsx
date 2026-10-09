import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Throw } from '../../kit/talk'
import type { Seat } from '../../kit/table'
import { useTalksOn } from '../prefs'
import { useSession } from '../session'
import { type Sound, playSound } from '../sound'
import { FLIGHT_MS, type Point, landing, lob, middle, reducedMotion, topMiddle } from './flight'
import { useHeard, useMutes } from './hooks'
import { Landings } from './landings'
import { Sticker } from './Sticker'

/** What each throw sounds like as it lands. A nudge on its target's own phone also buzzes (`nudged`). */
const LANDING: Record<Throw, Sound> = {
  chappal: 'throwSlap',
  rose: 'throwSoft',
  tomato: 'throwSplat',
  chip: 'throwChip',
  nudge: 'knock',
}

/**
 * Over the whole table: the throws in flight and resting where they landed, and the sound of
 * everything said. The frame mounts it for every game; it finds the seats by their names.
 */
export function TalkLayer({ seat }: { seat: Seat | null }) {
  const { talk } = useSession()
  const mutes = useMutes()
  const shown = useHeard()
  const me = useRef(seat)
  me.current = seat
  const talksOn = useTalksOn()
  const landings = useRef(new Landings())
  useEffect(
    () =>
      talk.onSaid(({ seat: from, say }) => {
        if (!talksOn || mutes.getState().has(from)) return
        if (say.kind === 'line') playSound('tap')
        else if (say.kind === 'emote') playSound('talkEmote')
        else {
          const after = reducedMotion() ? 0 : FLIGHT_MS
          landings.current.add(from, playSound(say.id === 'nudge' && say.at === me.current ? 'nudged' : LANDING[say.id], after), after)
        }
      }),
    [talk, mutes, talksOn],
  )
  // Muting a thrower, turning reactions off or leaving stops what has not landed yet, buzz and all.
  useEffect(() => {
    const pending = landings.current
    if (!talksOn) pending.stop()
    const unsubscribe = mutes.subscribe(() => pending.stop((from) => mutes.getState().has(from)))
    return () => {
      unsubscribe()
      pending.stop()
    }
  }, [mutes, talksOn])
  return (
    <div className="talk-layer" aria-hidden>
      {shown.map((s) => s.say.kind === 'throw' && <Flight key={s.key} from={s.seat} at={s.say.at} id={s.say.id} me={seat} />)}
    </div>
  )
}

const nameBox = (seat: Seat): DOMRect | undefined => document.querySelector(`[data-seat-name="${seat}"]`)?.getBoundingClientRect()
const handBox = (): DOMRect | undefined => document.querySelector('.hand')?.getBoundingClientRect()

/** Where a throw at `seat` lands: the corner of their name, or the top of the viewer's own hand when they have no name on screen. */
function aim(seat: Seat, me: Seat | null): Point | null {
  const name = nameBox(seat)
  if (name && name.width > 0) return landing(name, innerWidth)
  const hand = seat === me ? handBox() : undefined
  return hand ? topMiddle(hand) : null
}

/** Where a throw from `seat` leaves: the top of the viewer's own hand, or the thrower's name. */
function source(seat: Seat, me: Seat | null): Point | null {
  const hand = seat === me ? handBox() : undefined
  if (hand && hand.width > 0) return topMiddle(hand)
  const name = nameBox(seat)
  return name && name.width > 0 ? middle(name) : null
}

/**
 * One throw: a lob from the thrower to the target over the trick with one full spin, a squash on
 * landing, then a rest on the target's name, tilted, until it fades. Where a seat cannot be found
 * it simply lands; where the target cannot, it is not shown.
 */
function Flight({ from, at, id, me }: { from: Seat; at: Seat; id: Throw; me: Seat | null }) {
  const [path, setPath] = useState<ReturnType<typeof lob> | null>(null)
  useLayoutEffect(() => {
    const to = aim(at, me)
    if (to) setPath(lob(source(from, me) ?? to, to))
    // Measured once, as it is thrown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!path) return null
  const style = { left: path.x, top: path.y, '--dx': `${path.dx}px`, '--dy': `${path.dy}px`, '--peak': `${path.peak}px` } as CSSProperties
  return (
    <div className="throw" style={style}>
      <div className="throw-x">
        <div className="throw-y">
          <div className="throw-land">
            <Sticker id={id} className="throw-spin" />
          </div>
        </div>
      </div>
    </div>
  )
}
