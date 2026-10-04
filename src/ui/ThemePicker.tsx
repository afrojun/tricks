import { THEMES } from '../themes'
import { useTheme } from './session'

export function ThemePicker() {
  const { theme, cardBack, setTheme } = useTheme()
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {THEMES.map((t) => (
          <button key={t.id} className="btn btn-small" aria-pressed={t.id === theme.id} onClick={() => setTheme(t)} title={t.blurb}>
            {t.name}
          </button>
        ))}
      </div>
      {theme.cardBacks.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span>Card back</span>
          {theme.cardBacks.map((back) => (
            <button key={back.id} className="btn btn-small" aria-pressed={back.id === cardBack} onClick={() => setTheme(theme, back.id)}>
              {back.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
