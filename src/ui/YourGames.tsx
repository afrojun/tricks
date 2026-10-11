import { useEffect, useState } from 'react'
import { type KeptRoom, fetchStatus, keptRooms } from '../client/rooms'
import type { RoomStatus } from '../protocol'
import { GAMES } from './games'
import { Link } from './Link'
import { roomPath } from './routes'
import { gameTitle, needsYou, rank, statusLine } from './yourGames'

interface Row {
  room: KeptRoom
  name: string
  status: RoomStatus
}

/**
 * The games this device sits in, each with what it waits on, asked of each room as the page opens and
 * whenever it comes back into view. Shows nothing until a room answers, and nothing when none does.
 * `game` keeps to one game's rooms; `onlyYours` to the rows that need the player now.
 */
export function YourGames({ game, onlyYours = false }: { game?: string; onlyYours?: boolean }) {
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    let live = true
    const refresh = async () => {
      const rooms = keptRooms().filter((r) => game === undefined || r.game === game)
      const answers = await Promise.all(
        rooms.map(async (room): Promise<Row | null> => {
          const name = GAMES.find((g) => g.id === room.game)?.name
          const status = name === undefined ? null : await fetchStatus(room)
          return name !== undefined && status !== null && status !== 'unknown' ? { room, name, status } : null
        }),
      )
      if (live) setRows(answers.filter((r): r is Row => r !== null).sort((a, b) => rank(a.status) - rank(b.status)))
    }
    void refresh()
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      live = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [game])

  const shown = onlyYours ? rows.filter((r) => needsYou(r.status)) : rows
  if (shown.length === 0) return null
  return (
    <section className="home-width panel p-4 grid gap-2" aria-label="Your games">
      <h2 className="display text-xl">Your games</h2>
      <ul className="grid gap-2">
        {shown.map(({ room, name, status }) => (
          <li key={`${room.game}-${room.code}`}>
            <Link href={roomPath(room.game, room.code)} className="btn w-full text-left">
              <span className="grid flex-1">
                <span>{gameTitle(name, room.code, status)}</span>
                <span className={`text-sm ${needsYou(status) ? 'font-semibold' : 'font-normal text-on-surface-muted'}`}>{statusLine(status)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
