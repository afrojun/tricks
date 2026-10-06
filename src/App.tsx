import { thuneeClient } from './games/thunee/client'
import { anyClient } from './ui/contract'
import { GameScreen } from './ui/GameScreen'
import { Home } from './ui/Home'
import { PracticeScreen } from './ui/PracticeScreen'
import { TricksHome } from './ui/TricksHome'
import { route } from './ui/routes'
import { GameProvider, ThemeProvider, usePath } from './ui/session'

const THUNEE = anyClient(thuneeClient)

function Routes() {
  const at = route(usePath())
  if (at.screen === 'tricks') return <TricksHome />
  return (
    <GameProvider value={THUNEE}>
      {at.screen === 'practice' ? <PracticeScreen /> : at.screen === 'room' ? <GameScreen room={at.code} /> : <Home />}
    </GameProvider>
  )
}

export function App() {
  return (
    <ThemeProvider>
      <Routes />
    </ThemeProvider>
  )
}
