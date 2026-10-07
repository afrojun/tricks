import type { MouseEvent } from 'react'
import { GAMES, type GameId } from './games'
import { PlayingCard } from './Card'
import { ThemePicker } from './ThemePicker'
import { gamePath, opensInPlace } from './routes'
import { tableSizes } from './seats'
import { navigate } from './session'

/** `/`: the games, and the look that every game shares. Loads no game. */
export function TricksHome() {
  // A modified or middle click keeps the link's own behaviour, such as opening a new tab.
  const open = (game: GameId) => (e: MouseEvent) => {
    if (!opensInPlace(e)) return
    e.preventDefault()
    navigate(gamePath(game))
  }
  return (
    <main className="min-h-full flex flex-col items-center gap-5 p-4 pb-10">
      <header className="text-center mt-8 mb-2 flex flex-col items-center">
        <img src="/favicon.svg?v=2" alt="" width={72} height={72} className="tricks-mark" />
        <h1 className="wordmark text-[5.5rem]">Tricks</h1>
        <p className="font-semibold mt-3 max-w-[19em] mx-auto">Trick-taking card games to play with friends or the computer.</p>
      </header>

      <section className="w-full max-w-sm grid gap-5" aria-label="Games">
        {GAMES.map((game, i) => (
          <a key={game.id} href={gamePath(game.id)} onClick={open(game.id)} className={`panel relative grid gap-1 py-4 pl-4 pr-24 ${i % 2 ? 'panel-danger' : ''}`}>
            <h2 className="display text-3xl">{game.name}</h2>
            <p>{game.tagline}</p>
            <p className="justify-self-start role-badge !text-on-surface !border-on-surface">{tableSizes(game.seatCounts)}</p>
            <span className="absolute right-4 -top-2.5 rotate-[8deg]" aria-hidden>
              <PlayingCard card={game.emblem} size="trick" />
            </span>
          </a>
        ))}
      </section>

      <section className="panel panel-info p-4 w-full max-w-sm grid gap-3">
        <h2 className="display text-2xl">Look</h2>
        <ThemePicker />
      </section>
    </main>
  )
}
