import { useEffect, useState } from 'react'
import { canStart, cleanName } from '../kit/table'
import type { ShellView } from './contract'
import { type GameSetup, setupKey } from './Home'
import { RulesEditor, RulesList, rulesSummary } from './Rules'
import { gamePath, roomPath } from './routes'
import { PERSONA_CHOICES, PERSONA_NAMES } from './personas'
import { partnersLine, seatLabel, teamsAt } from './seats'
import { Sheet } from './Sheet'
import { navigate, useGameClient, useSession } from './session'
import { copyText } from './text'
import { playSound } from './sound'

const NAME_KEY = 'tricks-name'

function readSetup(game: string, room: string): GameSetup | null {
  try {
    const raw = sessionStorage.getItem(setupKey(game, room))
    return raw ? (JSON.parse(raw) as GameSetup) : null
  } catch {
    return null
  }
}

export function Lobby({ view, room }: { view: ShellView; room: string }) {
  const game = useGameClient()
  const { send } = useSession()
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '')
  const [copied, setCopied] = useState(false)
  const [picking, setPicking] = useState<number | null>(null)
  const [sheet, setSheet] = useState<'rules' | 'edit' | null>(null)
  const me = view.seat
  const isHost = me !== null && view.host === me
  const empty = view.seats.filter((s) => s.kind === 'empty').length
  // With cheating off every computer plays as Straight, so there is no persona to choose or show.
  const personas = view.rules.allowCheating

  // The creator's choices from the home screen. They apply only if the creator is the
  // first to sit; if someone else already hosts, the lobby's settings stand.
  const [setup, setSetup] = useState<GameSetup | null>(() => readSetup(game.id, room))
  useEffect(() => {
    if (setup === null || view.owner === null) return
    sessionStorage.removeItem(setupKey(game.id, room))
    setSetup(null)
    if (view.owner !== me) return
    if (setup.playerCount !== view.playerCount) send({ type: 'setPlayerCount', playerCount: setup.playerCount })
    send({ type: 'setRules', overrides: setup.overrides })
  }, [setup, view.owner, view.playerCount, me, game, room, send])
  // Until that happens, offer only the seats the creator's game will have.
  const seatLimit = setup?.playerCount ?? view.playerCount
  const teams = teamsAt((seat, count) => game.lobbyTeams(seat, count), view.playerCount)
  const partners = partnersLine(teams)
  /** A smaller table needs the seats it would drop to be empty. */
  const fits = (count: number) => view.seats.slice(count).every((s) => s.kind === 'empty')

  const sit = (seat: number) => {
    const clean = cleanName(name)
    if (clean === null) return
    localStorage.setItem(NAME_KEY, clean)
    playSound('tap')
    send({ type: 'sit', seat, name: clean })
  }
  const copyInvite = async () => {
    if (await copyText(`${location.origin}${roomPath(game.id, room)}`)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <main className="min-h-full flex flex-col items-center gap-4 p-4 pb-10">
      <header className="w-full max-w-sm flex items-center justify-between mt-2">
        <button className="btn btn-quiet btn-small" onClick={() => navigate(gamePath(game.id))}>
          Leave
        </button>
        <button className="btn btn-quiet btn-small" onClick={copyInvite} aria-label="Copy invite link">
          {copied ? 'Link copied' : `Copy invite link (${room})`}
        </button>
      </header>

      <section className="panel p-4 w-full max-w-sm grid gap-3">
        <h1 className="display text-xl">Take a seat</h1>
        {me === null && (
          <label className="grid gap-1">
            <span>Your name</span>
            <input className="field" value={name} maxLength={16} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Name" />
          </label>
        )}
        <ul className="grid gap-2">
          {view.seats.slice(0, seatLimit).map((seat, i) => {
            const team = teams[i] ?? null
            return (
              <li key={i} className="flex items-center gap-2 border-b border-line/40 pb-2">
                {team !== null && <span className="w-3 h-3 rounded-full shrink-0" style={{ background: `var(--team${team})` }} aria-hidden />}
                <div className="flex-1 min-w-0">
                  <p className="truncate font-semibold">
                    {seat.kind === 'empty' ? 'Empty seat' : seat.name}
                    {i === me && ' (you)'}
                  </p>
                  <p className="text-sm text-on-surface-muted">
                    {seatLabel(i, teams)}
                    {seat.kind === 'ai' && (personas ? `, computer: ${seat.persona === null ? 'secret' : PERSONA_NAMES[seat.persona]}` : ', computer')}
                    {view.host === i && ', host'}
                    {seat.kind === 'human' && !seat.connected && ', disconnected'}
                  </p>
                </div>
                {seat.kind === 'empty' && me === null && (
                  <button className="btn btn-primary btn-small" onClick={() => sit(i)} disabled={cleanName(name) === null}>
                    Sit here
                  </button>
                )}
                {seat.kind === 'empty' && isHost && (
                  <button className="btn btn-small" onClick={() => (personas ? setPicking(i) : send({ type: 'addAi', seat: i }))}>
                    Add computer
                  </button>
                )}
                {seat.kind !== 'empty' && isHost && i !== me && (
                  <button className="btn btn-small" onClick={() => send({ type: 'clearSeat', seat: i })}>
                    Remove
                  </button>
                )}
                {i === me && (
                  <button className="btn btn-small" onClick={() => send({ type: 'leaveSeat' })}>
                    Stand up
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        {partners && <p className="text-sm text-on-surface-muted">{partners}</p>}
      </section>

      <section className="panel p-4 w-full max-w-sm grid gap-3">
        <h2 className="display text-lg">Rules</h2>
        <p>{rulesSummary(game, view.rules)}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-small" onClick={() => setSheet('rules')}>
            See every rule
          </button>
          {isHost && (
            <button className="btn btn-small" onClick={() => setSheet('edit')}>
              Change rules
            </button>
          )}
        </div>
        {isHost && game.seatCounts.length > 1 && (
          <div className="flex gap-2">
            {[...game.seatCounts]
              .sort((a, b) => b - a)
              .map((n) => (
                <button key={n} className="btn btn-small flex-1" aria-pressed={view.playerCount === n} disabled={!fits(n)} onClick={() => send({ type: 'setPlayerCount', playerCount: n })}>
                  {n} players
                </button>
              ))}
          </div>
        )}
      </section>

      <div className="w-full max-w-sm grid gap-2">
        {isHost ? (
          <button
            className="btn btn-primary"
            disabled={!canStart(view)}
            onClick={() => {
              playSound('tap')
              send({ type: 'start' })
            }}
          >
            {empty > 0 ? `Waiting for ${empty} more` : 'Start game'}
          </button>
        ) : (
          <p className="text-center text-muted">{me === null ? 'Enter your name and pick a seat.' : 'Waiting for the host to start.'}</p>
        )}
      </div>

      {sheet === 'rules' && (
        <Sheet title="Rules" onClose={() => setSheet(null)}>
          <RulesList game={game} rules={view.rules} />
        </Sheet>
      )}
      {sheet === 'edit' && (
        <Sheet title="Change rules" onClose={() => setSheet(null)}>
          <RulesEditor game={game} rules={view.rules} onChange={(overrides) => send({ type: 'setRules', overrides })} />
        </Sheet>
      )}
      {picking !== null && personas && (
        <Sheet title="Choose a computer player" onClose={() => setPicking(null)}>
          <ul className="grid gap-2">
            {PERSONA_CHOICES.map((choice) => (
              <li key={choice.value}>
                <button
                  className="btn w-full text-left"
                  onClick={() => {
                    send({ type: 'addAi', seat: picking, persona: choice.value })
                    setPicking(null)
                  }}
                >
                  <span className="grid w-full gap-0.5">
                    <span className="font-semibold">{choice.label}</span>
                    <span className="text-sm text-on-surface-muted">{choice.text}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </main>
  )
}
