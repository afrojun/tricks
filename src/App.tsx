import { GameScreen } from './ui/GameScreen'
import { Home } from './ui/Home'
import { PracticeScreen } from './ui/PracticeScreen'
import { TricksHome } from './ui/TricksHome'
import { route } from './ui/routes'
import { ThemeProvider, usePath } from './ui/session'

function Routes() {
  const at = route(usePath())
  switch (at.screen) {
    case 'practice':
      return <PracticeScreen />
    case 'room':
      return <GameScreen room={at.code} />
    case 'home':
      return <Home />
    case 'tricks':
      return <TricksHome />
  }
}

export function App() {
  return (
    <ThemeProvider>
      <Routes />
    </ThemeProvider>
  )
}
