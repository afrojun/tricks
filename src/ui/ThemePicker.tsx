import { THEMES } from '../themes'
import { useTheme } from './session'

/** The table colour and the card back, each a row of swatches: the chosen one is ringed. */
export function ThemePicker() {
  const { theme, cardBack, setTheme } = useTheme()
  return (
    <div className="menu-group">
      <div className="menu-row" role="group" aria-label="Table">
        Table
        <span className="flex gap-2.5">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className="swatch"
              style={{ background: t.chrome }}
              aria-label={t.name}
              aria-pressed={t.id === theme.id}
              title={t.blurb}
              onClick={() => setTheme(t)}
            />
          ))}
        </span>
      </div>
      {theme.cardBacks.length > 1 && (
        <div className="menu-row" role="group" aria-label="Card back">
          Card back
          <span className="flex gap-2.5">
            {theme.cardBacks.map((back) => (
              <button
                key={back.id}
                className="swatch swatch-back"
                data-back={back.id}
                aria-label={back.name}
                aria-pressed={back.id === cardBack}
                onClick={() => setTheme(theme, back.id)}
              />
            ))}
          </span>
        </div>
      )}
    </div>
  )
}
