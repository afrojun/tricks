import type { Showing } from '../../client/talk'
import { useClient } from '../session'
import { useSaidAt } from './hooks'
import { Sticker } from './Sticker'
import { LINE_TEXT, STICKER_NAME } from './words'

/** A line as a bubble, landing yellow as calls do, or an emote's sticker, popping in tilted; both leave on their own. */
export function TalkSaid({ showing, mine = false }: { showing: Showing; mine?: boolean }) {
  const { say } = showing
  if (say.kind === 'line')
    return (
      <span className="bubble talk-said" data-mine={mine || undefined}>
        {LINE_TEXT[say.id]}
      </span>
    )
  if (say.kind === 'emote')
    return (
      <span className="talk-sticker" data-mine={mine || undefined} role="img" aria-label={STICKER_NAME[say.id]}>
        <Sticker id={say.id} />
      </span>
    )
  return null
}

/** The player's own line or emote, for a game to place in its hint row as it places their calls. */
export function TalkMine() {
  const { view } = useClient()
  const showing = useSaidAt(view?.seat ?? null)
  return showing && <TalkSaid key={showing.key} showing={showing} mine />
}
