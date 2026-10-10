import { useEffect, useState } from 'react'
import type { Note } from '../../practice/contract'
import type { ShellView } from '../contract'
import { sessionHooks } from '../session'
import { AdviceSheet, type Lessons, LogSheet, TopicSheet, WarningSheet } from './CoachSheets'
import { useCoach } from './context'
import { DrillBrief, DrillVerdict } from './DrillSheets'

/** The coach's advice is one of the game's own actions, sent as it came. */
const { useSession } = sessionHooks<ShellView, unknown, { type: string }>()

/**
 * The coach's line above the hand: the situation and Hint on your decision, otherwise the latest news.
 * In a drill, its guide comes first, and once it is over its verdict, with Try again. Once the round's
 * result is `over` the table, the result and its review say it all, so the line steps aside, but for a
 * drill's verdict; a lesson or sheet still opens over the result.
 */
export function CoachStrip({ lessons, over = false }: { lessons: Lessons; over?: boolean }) {
  const coached = useCoach()
  const { send } = useSession()
  const [hintOpen, setHintOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  /** The verdict the player closed, to read the table behind it. */
  const [closed, setClosed] = useState<object | null>(null)
  const coach = coached?.coach
  const reading = hintOpen || logOpen
  useEffect(() => {
    coach?.setReading('strip', reading)
  }, [coach, reading])
  if (!coached) return null
  const { state } = coached
  const drill = state.drill
  const verdict = drill?.verdict ?? null

  const line: Note | null = verdict?.note ?? state.guide ?? (state.trickPaused ? state.latest : (state.situation ?? state.latest))
  return (
    <>
      {(!over || verdict) && (
        <div className="coach-strip" aria-live="polite">
          <button className="coach-line" onClick={() => setLogOpen(true)} aria-label="Show this round so far">
            {line ? (
              <>
                <strong>{line.title}.</strong> {line.body}
              </>
            ) : (
              'The coach explains each move here.'
            )}
          </button>
          {/* A pause can hold a decision too, a Jodhi to call: then Hint stands beside Continue. */}
          {state.advice && !verdict && (
            <button
              className="btn btn-small"
              onClick={() => {
                coached.coach.hint()
                setHintOpen(true)
              }}
            >
              Hint
            </button>
          )}
          {drill && verdict ? (
            <button className="btn btn-primary btn-small" onClick={() => coached.coach.openDrill(drill.id)}>
              Try again
            </button>
          ) : (
            state.trickPaused && (
              <button className="btn btn-primary btn-small" onClick={() => coached.coach.continueTrick()}>
                Continue
              </button>
            )
          )}
        </div>
      )}

      {/* A topic or warning takes the screen; the hint waits behind it. */}
      {hintOpen && state.advice && !state.topic && !state.warning && (
        <AdviceSheet
          lessons={lessons}
          advice={state.advice}
          onDo={() => {
            setHintOpen(false)
            send(state.advice!.action)
          }}
          onClose={() => setHintOpen(false)}
        />
      )}
      {logOpen && <LogSheet log={state.log} onClose={() => setLogOpen(false)} />}
      {state.warning && <WarningSheet lessons={lessons} note={state.warning.note} onAnyway={() => coached.coach.confirm()} onBack={() => coached.coach.cancel()} />}
      {drill?.briefing && <DrillBrief lessons={lessons} drill={drill} onStart={() => coached.coach.startDrill()} />}
      {drill && verdict && verdict !== closed && (
        <DrillVerdict drill={drill} onAgain={() => coached.coach.openDrill(drill.id)} onNext={(id) => coached.coach.openDrill(id)} onClose={() => setClosed(verdict)} />
      )}
      {!state.warning && state.topic && <TopicSheet lessons={lessons} id={state.topic} onClose={() => coached.coach.dismissTopic()} closeLabel="Got it" />}
    </>
  )
}
