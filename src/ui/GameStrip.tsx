import { PlayingCard } from './Card'
import { GAMES } from './games'
import { Link } from './Link'
import { gamePath } from './routes'

/** The games other than `current`, a row each, coloured by their place in `GAMES` as their boxes on the Tricks home are. */
export function GameStrip({ current }: { current: string }) {
  return (
    <nav className="md:col-span-2 grid gap-3" aria-label="Other games">
      {GAMES.map((game, i) =>
        game.id === current ? null : (
          <Link key={game.id} href={gamePath(game.id)} className={`panel flex items-center gap-3 py-2 px-3 ${i % 2 ? 'panel-danger' : ''}`}>
            <span className="-my-3 -rotate-6" aria-hidden>
              <PlayingCard card={game.emblem} size="small" style={{ '--w': '2.2rem' } as React.CSSProperties} />
            </span>
            <span className="flex-1 min-w-0 grid">
              <span className="text-xs font-extrabold uppercase tracking-wider text-on-surface-muted" aria-hidden>
                Also on Tricks
              </span>
              <span className="display text-lg">{game.name}</span>
              <span className="text-sm truncate">{game.tagline}</span>
            </span>
            <span className="display text-2xl" aria-hidden>
              ›
            </span>
          </Link>
        ),
      )}
    </nav>
  )
}
