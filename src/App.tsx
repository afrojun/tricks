import { Suspense, use } from 'react'
import { ErrorBoundary, GameScreen } from './ui/GameScreen'
import { GAMES, loadGame } from './ui/games'
import { Home } from './ui/Home'
import { PracticeScreen } from './ui/PracticeScreen'
import { TricksHome } from './ui/TricksHome'
import { type Route, route } from './ui/routes'
import { GameProvider, ThemeProvider, usePath } from './ui/session'

type GameRoute = Exclude<Route, { screen: 'tricks' }>

/** A game's addresses, once its screens have loaded. */
function GameRoutes({ at }: { at: GameRoute }) {
  const game = use(loadGame(at.game))
  return (
    <GameProvider value={game}>
      {at.screen === 'practice' ? <PracticeScreen /> : at.screen === 'room' ? <GameScreen room={at.code} /> : <Home />}
    </GameProvider>
  )
}

function Loading({ at }: { at: GameRoute }) {
  const name = GAMES.find((game) => game.id === at.game)?.name
  return (
    <main className="h-full grid place-items-center p-6 text-center">
      <p className="display text-xl turn-marker">Opening {name}</p>
    </main>
  )
}

function Routes() {
  const at = route(usePath())
  if (at.screen === 'tricks') return <TricksHome />
  return (
    <ErrorBoundary key={at.game} home="/" title="The game did not open" body="Check your connection, then reload." leave="Back to Tricks">
      <Suspense fallback={<Loading at={at} />}>
        <GameRoutes at={at} />
      </Suspense>
    </ErrorBoundary>
  )
}

export function App() {
  return (
    <ThemeProvider>
      <Routes />
    </ThemeProvider>
  )
}
