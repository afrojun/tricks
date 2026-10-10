import { useState } from 'react'
import type { Card } from '../../kit/cards'
import type { Note } from '../../practice/contract'
import { PlayingCard } from '../Card'
import type { ShellView } from '../contract'
import { Sheet } from '../Sheet'
import { seatName } from '../text'

/** A short written lesson the coach can open. */
export interface Lesson {
  title: string
  paragraphs: readonly string[]
  example?: readonly Card[]
}

/** A game's lessons by topic id. A game without written lessons has none. */
export type Lessons = Readonly<Record<string, Lesson>>

export function CardRow({ cards }: { cards: readonly Card[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {cards.map((c) => (
        <PlayingCard key={`${c.rank}${c.suit}`} card={c} size="small" />
      ))}
    </div>
  )
}

function TopicBody({ lesson }: { lesson: Lesson }) {
  return (
    <div className="grid gap-3">
      {lesson.paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
      {lesson.example && <CardRow cards={lesson.example} />}
    </div>
  )
}

/** A link to the lesson a note is about, when the game has one. */
export function TopicLink({ lessons, id, onOpen }: { lessons: Lessons; id: string | undefined; onOpen: (id: string) => void }) {
  if (id === undefined || !lessons[id]) return null
  return (
    <button className="btn btn-quiet btn-small justify-self-start" onClick={() => onOpen(id)}>
      Learn about {lessons[id].title.toLowerCase()}
    </button>
  )
}

export function TopicSheet({ lessons, id, onClose, closeLabel = 'Close' }: { lessons: Lessons; id: string; onClose: () => void; closeLabel?: string }) {
  const lesson = lessons[id]
  if (!lesson) return null
  return (
    <Sheet title={lesson.title} onClose={onClose}>
      <div className="grid gap-4">
        <TopicBody lesson={lesson} />
        <button className="btn btn-primary" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </Sheet>
  )
}

export function AdviceSheet({ lessons, advice, onDo, onClose }: { lessons: Lessons; advice: { note: Note }; onDo: () => void; onClose: () => void }) {
  const [topic, setTopic] = useState<string | null>(null)
  if (topic) return <TopicSheet lessons={lessons} id={topic} onClose={() => setTopic(null)} closeLabel="Back to the hint" />
  const { note } = advice
  return (
    <Sheet title="Hint" onClose={onClose}>
      <div className="grid gap-3">
        <h3 className="display text-lg text-accent">{note.title}</h3>
        {note.cards && <CardRow cards={note.cards} />}
        <p>{note.body}</p>
        <TopicLink lessons={lessons} id={note.topic} onOpen={setTopic} />
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

export function WarningSheet({ lessons, note, onAnyway, onBack }: { lessons: Lessons; note: Note; onAnyway: () => void; onBack: () => void }) {
  const [topic, setTopic] = useState<string | null>(null)
  if (topic) return <TopicSheet lessons={lessons} id={topic} onClose={() => setTopic(null)} closeLabel="Back" />
  return (
    <Sheet title={note.title} onClose={onBack}>
      <div className="grid gap-3">
        <p>{note.body}</p>
        <TopicLink lessons={lessons} id={note.topic} onOpen={setTopic} />
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

export function HowToPlaySheet({ lessons, onClose }: { lessons: Lessons; onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  if (open) return <TopicSheet lessons={lessons} id={open} onClose={() => setOpen(null)} closeLabel="Back to all topics" />
  return (
    <Sheet title="How to play" onClose={onClose}>
      <div className="grid gap-2">
        {Object.keys(lessons).map((id) => (
          <button key={id} className="btn" onClick={() => setOpen(id)}>
            {/* The title takes the row, so every one starts at the same edge: `.btn` centres what it holds. */}
            <span className="flex-1 text-left">{lessons[id].title}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

/** How a game shows the hands of a round: its own order, and a name for each deal when a round has more than one. */
export interface DealShown<C extends Card> {
  sort: (hand: readonly C[]) => C[]
  dealName?: (index: number) => string
}

/** Every hand as it was dealt, for the round review. */
export function HandsSheet<C extends Card>({ view, dealt, shown, onClose }: { view: ShellView; dealt: C[][][]; shown: DealShown<C>; onClose: () => void }) {
  return (
    <Sheet title="All hands" onClose={onClose}>
      <div className="grid gap-4">
        {dealt.map((deal, h) => (
          <section key={h} className="grid gap-3">
            {dealt.length > 1 && <h3 className="display text-lg">{shown.dealName?.(h) ?? `Deal ${h + 1}`}</h3>}
            {deal.map((hand, seat) => (
              <div key={seat} className="grid gap-1">
                <span className="font-semibold">{seat === view.seat ? 'You' : seatName(view, seat)}</span>
                <CardRow cards={shown.sort(hand)} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </Sheet>
  )
}
