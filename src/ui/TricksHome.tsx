import { useEffect } from 'react'
import { GAMES } from './games'
import { PlayingCard } from './Card'
import { Link } from './Link'
import { gamePath } from './routes'
import { tableSizes } from './seats'
import { TopBar } from './TopBar'
import { YourGames } from './YourGames'

/** `/`: the games, and the look that every game shares. Loads no game. */
export function TricksHome() {
  // The app's badge says a game waits on the player; here they see which.
  useEffect(() => {
    const clear = () => document.visibilityState === 'visible' && void navigator.clearAppBadge?.().catch(() => {})
    clear()
    document.addEventListener('visibilitychange', clear)
    return () => document.removeEventListener('visibilitychange', clear)
  }, [])
  return (
    <main className="home min-h-full flex flex-col items-center gap-5 p-4 pb-10">
      <TopBar />
      <header className="text-center mb-2 flex flex-col items-center">
        <img src="/favicon.svg?v=2" alt="" width={72} height={72} className="tricks-mark" />
        <h1 className="wordmark text-[5.5rem] md:text-[7rem]">Tricks</h1>
        <p className="font-semibold mt-3 max-w-[19em] mx-auto">Trick-taking card games to play with friends or the computer.</p>
      </header>

      <YourGames />

      <section className="home-width grid gap-5 md:grid-cols-2 md:gap-6" aria-label="Games">
        {GAMES.map((game, i) => (
          <Link key={game.id} href={gamePath(game.id)} className={`panel relative grid gap-1 py-4 pl-4 pr-24 ${i % 2 ? 'panel-danger' : ''}`}>
            <h2 className="display text-3xl">{game.name}</h2>
            <p>{game.tagline}</p>
            <p className="justify-self-start role-badge !text-on-surface !border-on-surface">{tableSizes(game.seatCounts)}</p>
            <span className="absolute right-4 -top-2.5 rotate-[8deg]" aria-hidden>
              <PlayingCard card={game.emblem} size="trick" />
            </span>
          </Link>
        ))}
      </section>
    </main>
  )
}
