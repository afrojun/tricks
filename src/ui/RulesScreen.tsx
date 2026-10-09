import { useEffect, useRef, useState } from 'react'
import { resolve } from '../kit/rules'
import { decodeShare, shareUrl } from '../presets/share'
import { type Preset, cleanPresetName, deletePreset, listPresets, presetsKey, readChoice, renamePreset, savePreset, updatePreset, writeChoice } from '../presets/storage'
import type { ShellView } from './contract'
import { Link } from './Link'
import { RuleControls, RulesList } from './Rules'
import { gamePath, roomPath, rulesPath, rulesQuery } from './routes'
import { replaceAddress, useGameClient } from './session'
import { copyText } from './text'
import { TopBar } from './TopBar'

type Rules = ShellView['rules']

const NOT_SAVED = "Not saved. This device's storage is full or off."

/** A saved preset's name, renamed on blur or Enter. A blank name, or one storage refuses, shows the old name again. */
function PresetName({ name, focus, onRename }: { name: string; focus: boolean; onRename: (name: string) => boolean }) {
  const [draft, setDraft] = useState(name)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!focus) return
    field.current?.focus()
    field.current?.select()
  }, [focus])
  const commit = () => {
    if (draft === name) return
    if (cleanPresetName(draft) === null || !onRename(draft)) setDraft(name)
  }
  return (
    <input
      ref={field}
      className="field font-semibold"
      aria-label="Preset name"
      value={draft}
      maxLength={30}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

/**
 * `/<game>/rules`: the game's presets, built in and saved. Saved ones are edited here and nowhere
 * else; a share link's rules arrive here to be saved. The home and the lobby only pick one.
 */
export function RulesScreen() {
  const game = useGameClient()
  const book = game.rules
  // Read once: every link into the screen changes the pathname, so it mounts afresh.
  const [query] = useState(() => rulesQuery(location.search))
  const [presets, setPresets] = useState(() => listPresets(game))
  const [shared, setShared] = useState(() => (query.shared === undefined ? null : decodeShare(game, query.shared)))
  /** The selected preset's id; null while the shared one is. */
  const [selected, setSelected] = useState<string | null>(() => {
    if (shared?.ok) return null
    return presets.some((p) => p.id === query.preset) ? query.preset! : readChoice(game)
  })
  const [notSaved, setNotSaved] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)
  /** A preset just made, whose name is focused for typing over. */
  const [made, setMade] = useState<string | null>(null)
  /** Bumped when a change is refused, so the controls show the saved rules again. */
  const [refused, setRefused] = useState(0)

  // Another tab may change the presets.
  useEffect(() => {
    const reread = (e: StorageEvent) => e.key === presetsKey(game.id) && setPresets(listPresets(game))
    addEventListener('storage', reread)
    return () => removeEventListener('storage', reread)
  }, [game])

  const sharing = selected === null && shared?.ok ? shared : null
  const current = sharing ? null : (presets.find((p) => p.id === selected) ?? presets[0])
  const overrides = sharing?.overrides ?? current!.overrides
  const name = sharing?.name ?? current!.name

  const refuse = () => {
    setNotSaved(true)
    setRefused((n) => n + 1)
  }
  const select = (id: string, next: Preset<Rules>[] = presets) => {
    setPresets(next)
    setSelected(id)
    writeChoice(game.id, id)
    setNotSaved(false)
    setConfirming(false)
    setMade(null)
    // A reload shows the same preset. Saved or dismissed, a shared preset is gone, and a reload does not bring it back.
    setShared(null)
    replaceAddress(rulesPath(game.id, { preset: id, from: query.from }))
  }
  const create = (presetName: string, presetOverrides: Partial<Rules>) => {
    const preset = savePreset(game, presetName, presetOverrides)
    if (!preset) return refuse()
    select(preset.id, listPresets(game))
    setMade(preset.id)
  }
  const update = (next: Partial<Rules>) => {
    if (!current || !updatePreset(game, current.id, next)) return refuse()
    setPresets(listPresets(game))
    setNotSaved(false)
  }
  const rename = (next: string) => {
    if (!current || !renamePreset(game, current.id, next)) {
      if (cleanPresetName(next) !== null) setNotSaved(true)
      return false
    }
    setPresets(listPresets(game))
    setNotSaved(false)
    setMade(null)
    return true
  }
  const remove = () => {
    if (!current || !deletePreset(game, current.id)) {
      setConfirming(false)
      return refuse()
    }
    const next = listPresets(game)
    select(next[0].id, next)
  }
  const copyLink = async () => {
    if (await copyText(shareUrl(game, name, overrides))) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const back = query.from ? { href: roomPath(game.id, query.from), label: `Game ${query.from}` } : { href: gamePath(game.id), label: game.name }
  const rules = resolve(book.defaults, overrides)

  return (
    <main className="min-h-full flex flex-col items-center gap-3 p-4 pb-10">
      <TopBar
        left={
          <Link href={back.href} className="btn btn-quiet btn-small">
            <span aria-hidden>‹</span> {back.label}
          </Link>
        }
      />
      <div className="home-width grid gap-3 md:max-w-xl">
        <section className="panel p-4 grid gap-3">
          <h1 className="display text-2xl">House rules</h1>
          <p>Presets for {game.name}. Pick one on the home or in a lobby.</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button key={preset.id} className="btn btn-small" aria-pressed={preset.id === current?.id} onClick={() => select(preset.id)}>
                {preset.name}
              </button>
            ))}
            {shared?.ok && (
              <button className="btn btn-small" aria-pressed={sharing !== null} onClick={() => setSelected(null)}>
                {shared.name}
              </button>
            )}
            <button className="btn btn-small btn-quiet" onClick={() => create('New preset', overrides)}>
              + New
            </button>
          </div>
        </section>

        {shared && !shared.ok && (
          <section className="panel panel-danger p-4" role="alert">
            <p>{shared.error}</p>
          </section>
        )}

        <section className="panel p-4 grid gap-3" aria-label={name}>
          {current && !current.builtIn ? (
            <PresetName key={`${current.id} ${current.name}`} name={current.name} focus={made === current.id} onRename={rename} />
          ) : (
            <div>
              <h2 className="display text-xl">{name}</h2>
              <p className="text-sm text-on-surface-muted">{sharing ? 'Shared with you' : 'Built in'}</p>
            </div>
          )}

          {current && !current.builtIn ? (
            <RuleControls key={`${current.id} ${refused}`} game={game} rules={rules} onChange={update} />
          ) : (
            <RulesList game={game} rules={rules} />
          )}

          {sharing ? (
            <button className="btn btn-primary" onClick={() => create(sharing.name, sharing.overrides)}>
              Save
            </button>
          ) : confirming && current ? (
            <div className="grid gap-2">
              <p className="font-semibold">Delete {current.name}?</p>
              <div className="flex gap-2">
                <button className="btn btn-danger flex-1" onClick={remove}>
                  Delete
                </button>
                <button className="btn flex-1" onClick={() => setConfirming(false)}>
                  Keep
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className="btn flex-1" onClick={copyLink}>
                {copied ? 'Link copied' : 'Copy link'}
              </button>
              <button className="btn flex-1" onClick={() => create(`${name} copy`, overrides)}>
                Make a copy
              </button>
              {current && !current.builtIn && (
                <button className="btn flex-1" onClick={() => setConfirming(true)}>
                  Delete
                </button>
              )}
            </div>
          )}

          {notSaved && (
            <p className="text-danger font-semibold" role="alert">
              {NOT_SAVED}
            </p>
          )}
        </section>
      </div>
    </main>
  )
}
