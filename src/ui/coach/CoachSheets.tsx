import { useState } from 'react'
import type { Advice } from '../../coach/advise'
import type { Note, TopicId } from '../../coach/note'
import { TOPICS } from '../../coach/topics'
import type { Card, View } from '../../engine'
import { PlayingCard } from '../Card'
import { Sheet } from '../Sheet'
import { seatName, sortHand } from '../text'

function CardRow({ cards }: { cards: readonly Card[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {cards.map((c) => (
        <PlayingCard key={`${c.rank}${c.suit}`} card={c} size="small" />
      ))}
    </div>
  )
}

function TopicBody({ id }: { id: TopicId }) {
  const topic = TOPICS[id]
  return (
    <div className="grid gap-3">
      {topic.paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
      {topic.example && <CardRow cards={topic.example} />}
    </div>
  )
}

function TopicLink({ id, onOpen }: { id: TopicId; onOpen: (id: TopicId) => void }) {
  return (
    <button className="btn btn-quiet btn-small justify-self-start" onClick={() => onOpen(id)}>
      Learn about {TOPICS[id].title.toLowerCase()}
    </button>
  )
}

export function TopicSheet({ id, onClose, closeLabel = 'Close' }: { id: TopicId; onClose: () => void; closeLabel?: string }) {
  return (
    <Sheet title={TOPICS[id].title} onClose={onClose}>
      <div className="grid gap-4">
        <TopicBody id={id} />
        <button className="btn btn-primary" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </Sheet>
  )
}

export function AdviceSheet({ advice, onDo, onClose }: { advice: Advice; onDo: () => void; onClose: () => void }) {
  const [topic, setTopic] = useState<TopicId | null>(null)
  if (topic) return <TopicSheet id={topic} onClose={() => setTopic(null)} closeLabel="Back to the hint" />
  const { note } = advice
  return (
    <Sheet title="Hint" onClose={onClose}>
      <div className="grid gap-3">
        <h3 className="display text-lg text-accent">{note.title}</h3>
        {note.cards && <CardRow cards={note.cards} />}
        <p>{note.body}</p>
        {note.topic && <TopicLink id={note.topic} onOpen={setTopic} />}
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1" onClick={onDo}>
            {note.title}
          </button>
          <button className="btn flex-1" onClick={onClose}>
            I’ll choose
          </button>
        </div>
      </div>
    </Sheet>
  )
}

export function WarningSheet({ note, onAnyway, onBack }: { note: Note; onAnyway: () => void; onBack: () => void }) {
  const [topic, setTopic] = useState<TopicId | null>(null)
  if (topic) return <TopicSheet id={topic} onClose={() => setTopic(null)} closeLabel="Back" />
  return (
    <Sheet title={note.title} onClose={onBack}>
      <div className="grid gap-3">
        <p>{note.body}</p>
        {note.topic && <TopicLink id={note.topic} onOpen={setTopic} />}
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1" onClick={onBack}>
            Choose again
          </button>
          <button className="btn btn-danger flex-1" onClick={onAnyway}>
            Do it anyway
          </button>
        </div>
      </div>
    </Sheet>
  )
}

export function LogSheet({ log, onClose }: { log: readonly Note[]; onClose: () => void }) {
  return (
    <Sheet title="This round" onClose={onClose}>
      {log.length === 0 ? (
        <p className="text-on-surface-muted">Nothing has happened yet this round.</p>
      ) : (
        <ol className="grid gap-3">
          {log.map((n, i) => (
            <li key={`${i}-${n.title}`} className="border-b border-line/40 pb-2">
              <strong>{n.title}.</strong> {n.body}
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  )
}

export function HowToPlaySheet({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<TopicId | null>(null)
  if (open) return <TopicSheet id={open} onClose={() => setOpen(null)} closeLabel="Back to all topics" />
  return (
    <Sheet title="How to play" onClose={onClose}>
      <div className="grid gap-2">
        {(Object.keys(TOPICS) as TopicId[]).map((id) => (
          <button key={id} className="btn justify-start" onClick={() => setOpen(id)}>
            {TOPICS[id].title}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

/** Every hand as it was dealt, for the round review. */
export function HandsSheet({ view, dealt, onClose }: { view: View; dealt: Card[][][]; onClose: () => void }) {
  return (
    <Sheet title="All hands" onClose={onClose}>
      <div className="grid gap-4">
        {dealt.map((half, h) => (
          <section key={h} className="grid gap-3">
            {dealt.length > 1 && <h3 className="display text-lg">{h === 0 ? 'First half' : 'Second half'}</h3>}
            {half.map((hand, seat) => (
              <div key={seat} className="grid gap-1">
                <span className="font-semibold">{seat === view.seat ? 'You' : seatName(view, seat)}</span>
                <CardRow cards={sortHand(hand)} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </Sheet>
  )
}
