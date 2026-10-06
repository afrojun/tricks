import { useEffect, useState } from 'react'
import type { Note } from '../../coach/note'
import { AdviceSheet, LogSheet, TopicSheet, WarningSheet } from './CoachSheets'
import { useCoach, useSession } from '../session'

/** The coach's line above the hand: the situation and Hint on your decision, otherwise the latest news. */
export function CoachStrip() {
  const coached = useCoach()
  const { send } = useSession()
  const [hintOpen, setHintOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const coach = coached?.coach
  const reading = hintOpen || logOpen
  useEffect(() => {
    coach?.setReading('strip', reading)
  }, [coach, reading])
  if (!coached) return null
  const { state } = coached

  const line: Note | null = state.trickPaused ? state.latest : (state.situation ?? state.latest)
  return (
    <>
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
        {state.trickPaused ? (
          <button className="btn btn-primary btn-small" onClick={() => coached.coach.continueTrick()}>
            Continue
          </button>
        ) : (
          state.advice && (
            <button
              className="btn btn-small"
              onClick={() => {
                coached.coach.hint()
                setHintOpen(true)
              }}
            >
              Hint
            </button>
          )
        )}
      </div>

      {/* A topic or warning takes the screen; the hint waits behind it. */}
      {hintOpen && state.advice && !state.topic && !state.warning && (
        <AdviceSheet
          advice={state.advice}
          onDo={() => {
            setHintOpen(false)
            send(state.advice!.action)
          }}
          onClose={() => setHintOpen(false)}
        />
      )}
      {logOpen && <LogSheet log={state.log} onClose={() => setLogOpen(false)} />}
      {state.warning && <WarningSheet note={state.warning.note} onAnyway={() => coached.coach.confirm()} onBack={() => coached.coach.cancel()} />}
      {!state.warning && state.topic && <TopicSheet id={state.topic} onClose={() => coached.coach.dismissTopic()} closeLabel="Got it" />}
    </>
  )
}
