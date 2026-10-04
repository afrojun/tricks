import { GameScreen } from './ui/GameScreen'
import { Home, cleanCode } from './ui/Home'
import { ThemeProvider, usePath } from './ui/session'

function Routes() {
  const path = usePath()
  const match = /^\/game\/([^/]+)\/?$/.exec(path)
  // cleanCode keeps letters only, so a malformed or escaped path simply fails to match a room.
  const room = match ? cleanCode(match[1]) : ''
  return room.length === 6 ? <GameScreen room={room} /> : <Home />
}

export function App() {
  return (
    <ThemeProvider>
      <Routes />
    </ThemeProvider>
  )
}
