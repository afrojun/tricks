import { Suspense, use, useEffect, useRef } from 'react'
import { ErrorBoundary, GameScreen } from './ui/GameScreen'
import { GAMES, loadGame } from './ui/games'
import { Home } from './ui/Home'
import { PracticeScreen } from './ui/PracticeScreen'
import { RulesScreen } from './ui/RulesScreen'
import { TricksLink } from './ui/TopBar'
import { TricksHome } from './ui/TricksHome'
import { type Route, route } from './ui/routes'
import { GameProvider, ThemeProvider, usePath } from './ui/session'
import { Update } from './ui/Update'
import { startFelt } from './themes/felt'

type GameRoute = Exclude<Route, { screen: 'tricks' }>

/** A game's addresses, once its screens have loaded. */
function GameRoutes({ at }: { at: GameRoute }) {
  const game = use(loadGame(at.game))
  return (
    <GameProvider value={game}>
      {at.screen === 'practice' ? <PracticeScreen /> : at.screen === 'room' ? <GameScreen room={at.code} /> : at.screen === 'rules' ? <RulesScreen /> : <Home />}
    </GameProvider>
  )
}

function Loading({ at }: { at: GameRoute }) {
  const name = GAMES.find((game) => game.id === at.game)?.name
  return (
    <main className="h-full flex flex-col items-center p-4">
      <header className="w-full max-w-sm">
        <TricksLink />
      </header>
      <p className="display text-xl turn-marker my-auto text-center">Opening {name}</p>
    </main>
  )
}

function Routes() {
  const at = route(usePath())
  if (at.screen === 'tricks') return <TricksHome />
  return (
    <ErrorBoundary key={at.game} home="/" title="The game didn’t open" body="Check your connection, then reload." leave="Back to Tricks">
      <Suspense fallback={<Loading at={at} />}>
        <GameRoutes at={at} />
      </Suspense>
    </ErrorBoundary>
  )
}

/** The table surface behind every screen. */
function Felt() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => (canvas.current ? startFelt(canvas.current) : undefined), [])
  return <canvas ref={canvas} className="felt" aria-hidden />
}

export function App() {
  return (
    <ThemeProvider>
      <Felt />
      <Routes />
      <Update />
    </ThemeProvider>
  )
}
