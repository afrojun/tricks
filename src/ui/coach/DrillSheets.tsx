import { useState } from 'react'
import type { Note } from '../../practice/contract'
import type { DrillState } from '../../practice/session'
import { drillsPath } from '../routes'
import { navigate, useGameClient } from '../session'
import { Sheet } from '../Sheet'
import { SuitText } from '../SuitText'
import { CardRow, type Lessons, TopicLink, TopicSheet } from './CoachSheets'

/** What a drill teaches, before it starts. Closing it starts the drill too: the table behind it is the drill. */
export function DrillBrief({ lessons, drill, onStart }: { lessons: Lessons; drill: DrillState<Note>; onStart: () => void }) {
  const [topic, setTopic] = useState<string | null>(null)
  if (topic) return <TopicSheet lessons={lessons} id={topic} onClose={() => setTopic(null)} closeLabel="Back to the drill" />
  const { brief } = drill
  return (
    <Sheet title={drill.title} onClose={onStart}>
      <div className="grid gap-3">
        <h3 className="display text-lg text-accent"><SuitText text={brief.title} /></h3>
        {brief.cards && <CardRow cards={brief.cards} />}
        <p><SuitText text={brief.body} /></p>
        <TopicLink lessons={lessons} id={brief.topic} onOpen={setTopic} />
        <button className="btn btn-primary" onClick={onStart}>
          Start
        </button>
      </div>
    </Sheet>
  )
}

/** How the drill went, and where to go next. Closing it leaves the table in view. */
export function DrillVerdict({ drill, onAgain, onNext, onClose }: { drill: DrillState<Note>; onAgain: () => void; onNext: (id: string) => void; onClose: () => void }) {
  const game = useGameClient()
  const { passed, note } = drill.verdict!
  return (
    <Sheet title={passed ? 'Well played' : 'Not quite'} onClose={onClose}>
      <div className="grid gap-3">
        <h3 className={`display text-lg ${passed ? 'text-accent' : 'text-danger'}`}>
          <SuitText text={note.title} />
        </h3>
        {note.cards && <CardRow cards={note.cards} />}
        <p><SuitText text={note.body} /></p>
        <div className="flex gap-2">
          <button className={`btn flex-1 ${passed ? '' : 'btn-primary'}`} onClick={onAgain}>
            Try again
          </button>
          {drill.next && (
            <button className={`btn flex-1 ${passed ? 'btn-primary' : ''}`} onClick={() => onNext(drill.next!.id)}>
              Next drill
            </button>
          )}
        </div>
        <button className="btn btn-quiet" onClick={() => navigate(drillsPath(game.id))}>
          All drills
        </button>
      </div>
    </Sheet>
  )
}
