/**
 * The stickers: die-cut paper discs on a 48-unit grid with a 2.5 ink outline, drawn flat in the
 * deck's four inks on paper, so they read as part of the deck. Never system emoji. Each is drawn
 * inline, and painted through `style`, since not every browser reads a custom property in an SVG
 * attribute. Drawn by Fable in the table talk mockup.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { Emote, Throw } from '../../kit/talk'

export type StickerId = Emote | Throw

type Ink = 'paper' | 'ink' | 'red' | 'blue' | 'yellow'

/** A fill and, if given, an outline of `width`. */
function paint(fill: Ink | 'none', stroke?: Ink, width = 2.2): CSSProperties {
  return { fill: fill === 'none' ? 'none' : `var(--${fill})`, ...(stroke && { stroke: `var(--${stroke})`, strokeWidth: width }) }
}

const zed = (size: number): CSSProperties => ({ ...paint('blue', 'ink', 0.8), fontFamily: 'var(--font-body-family)', fontWeight: 900, fontSize: size, paintOrder: 'stroke' })

const DRAWINGS: Record<StickerId, ReactNode> = {
  clap: (
    <g style={{ stroke: 'var(--ink)', strokeWidth: 2.2 }}>
      <path d="M11 37V24q0-4 4-4h4q3 0 3 3v14z" style={paint('yellow')} transform="rotate(-14 17 30)" />
      <path d="M37 37V24q0-4-4-4h-4q-3 0-3 3v14z" style={paint('yellow')} transform="rotate(14 31 30)" />
      <path d="M15 22v-4M19 21v-5" style={paint('none')} transform="rotate(-14 17 30)" />
      <path d="M33 22v-4M29 21v-5" style={paint('none')} transform="rotate(14 31 30)" />
      <path d="M24 8v5M15 10l2 4M33 10l-2 4" style={paint('none', 'red', 2.6)} />
    </g>
  ),
  howl: (
    <>
      <circle cx="24" cy="24" r="14.5" style={paint('yellow', 'ink')} />
      <path d="M15 20l3-3 3 3M27 20l3-3 3 3" style={paint('none', 'ink')} />
      <path d="M15.5 26h17a8.5 8.5 0 0 1-17 0z" style={paint('ink')} />
      <path d="M18.5 30.5c3.5 4 7.5 4 11 0a6 6 0 0 0-11 0z" style={paint('red')} />
      <path d="M10 25c-2 3-2 6 0 7s3-2 1.5-5zM38 25c2 3 2 6 0 7s-3-2-1.5-5z" style={paint('blue', 'ink', 1.5)} />
    </>
  ),
  facepalm: (
    <>
      <circle cx="25" cy="24" r="14.5" style={paint('yellow', 'ink')} />
      <path d="M30 21l4 1M30 29h6" style={paint('none', 'ink')} />
      <path
        d="M9 36V20q0-3 3-3t3 3v4h1.5v-7q0-2.5 2.5-2.5t2.5 2.5v7H23v-6q0-2.5 2.5-2.5T28 18v8q0 10-9 10z"
        style={paint('yellow', 'ink')}
      />
    </>
  ),
  fire: (
    <>
      <path
        d="M24 7c1 6 7 8 8 14 3-2 3-6 2-8 5 4 7 10 5 16-2 5-7 8-15 8s-13-4-13-11c0-5 3-8 6-11 0 3 1 5 3 6 0-5 2-10 4-14z"
        style={paint('red', 'ink')}
      />
      <path d="M24 22c1 4 5 5 5 9 0 3-2 5-5 5s-5-2-5-5c0-2 1-3 2-4 0 2 1 2 2 2 0-3 0-5 1-7z" style={paint('yellow', 'ink', 1.6)} />
    </>
  ),
  eyes: (
    <>
      <ellipse cx="15.5" cy="24" rx="8" ry="10" style={paint('paper', 'ink')} />
      <ellipse cx="32.5" cy="24" rx="8" ry="10" style={paint('paper', 'ink')} />
      <circle cx="19" cy="25" r="4.2" style={paint('blue')} />
      <circle cx="36" cy="25" r="4.2" style={paint('blue')} />
      <circle cx="20" cy="25" r="2" style={paint('ink')} />
      <circle cx="37" cy="25" r="2" style={paint('ink')} />
      <path d="M8 13q7-5 15 0M25 13q7-5 15 0" style={paint('none', 'ink')} />
    </>
  ),
  sweat: (
    <>
      <circle cx="23" cy="25" r="14.5" style={paint('yellow', 'ink')} />
      <circle cx="18" cy="23" r="2" style={paint('ink')} />
      <circle cx="28" cy="23" r="2" style={paint('ink')} />
      <path d="M16 32c3-2 6 2 9 0s6-2 8 0M13 17l5-2M33 15l-5 2" style={paint('none', 'ink')} />
      <path d="M38 9c-3 4-5 7-5 9.5a5 5 0 0 0 10 0C43 16 41 13 38 9z" style={paint('blue', 'ink', 2)} />
    </>
  ),
  pray: (
    <g style={{ stroke: 'var(--ink)', strokeWidth: 2.2 }}>
      <path d="M24 10c-6 4-10 10-10 18 0 5 3 9 6 11l4-5z" style={paint('yellow')} />
      <path d="M24 10c6 4 10 10 10 18 0 5-3 9-6 11l-4-5z" style={paint('yellow')} />
      <path d="M24 10v24" style={paint('none')} />
      <path d="M8 16l3 2M40 16l-3 2M10 26h3M38 26h-3" style={paint('none', 'red', 2.4)} />
    </g>
  ),
  sleepy: (
    <>
      <circle cx="21" cy="26" r="14" style={paint('yellow', 'ink')} />
      <path d="M13 25h6M23 25h6" style={paint('none', 'ink')} />
      <ellipse cx="21" cy="33" rx="2.4" ry="3" style={paint('ink')} />
      <text x="29" y="18" style={zed(9)}>
        z
      </text>
      <text x="34" y="11" style={zed(12)}>
        z
      </text>
    </>
  ),
  chappal: (
    <>
      <path
        d="M24 6c6 0 9 5 9 12 0 8-3 13-4 19-1 4-3 6-5 6s-4-2-5-6c-1-6-5-11-5-19 0-7 4-12 10-12z"
        style={paint('blue', 'ink')}
      />
      <path d="M25 18c0-2 1-3 1.5-3M25 18l-8 8M25 18l8 8" style={paint('none', 'red', 3.2)} />
      <circle cx="25" cy="18" r="2.6" style={paint('yellow', 'ink', 1.6)} />
    </>
  ),
  rose: (
    <>
      <path d="M24 24v16" style={paint('none', 'ink', 2.4)} />
      <path d="M24 33c-6-1-9-4-9-8 5 0 8 3 9 8zM24 36c6-1 9-4 9-8-5 0-8 3-9 8z" style={paint('blue', 'ink', 2)} />
      <path d="M24 26c-7 0-11-4-11-9 0-5 4-9 11-9s11 4 11 9c0 5-4 9-11 9z" style={paint('red', 'ink')} />
      <path d="M17 17c3-4 9-5 12-2s2 8-3 8c-3 0-5-2-4-5s4-3 5-1" style={paint('none', 'ink', 1.8)} />
    </>
  ),
  tomato: (
    <>
      <circle cx="24" cy="27" r="13.5" style={paint('red', 'ink')} />
      <path d="M15 24c1-3 4-5 7-5" style={paint('none', 'paper', 2.4)} />
      <path d="M24 15l-2-6 4 3 3-5 1 6 6-2-4 5 5 2-6 1-1 3-4-2-5 2 1-4-6-2z" style={paint('blue', 'ink', 1.8)} />
    </>
  ),
  chip: (
    <>
      <circle cx="24" cy="24" r="17" style={paint('blue', 'ink')} />
      <g style={paint('paper')}>
        {[0, 45].map((turn) => (
          <g key={turn} transform={`rotate(${turn} 24 24)`}>
            <rect x="21" y="8" width="6" height="6" rx="1" />
            <rect x="21" y="34" width="6" height="6" rx="1" />
            <rect x="8" y="21" width="6" height="6" rx="1" />
            <rect x="34" y="21" width="6" height="6" rx="1" />
          </g>
        ))}
      </g>
      <circle cx="24" cy="24" r="10" style={paint('paper', 'ink', 2)} />
      <path d="M24 16.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" style={paint('yellow', 'ink', 1.5)} />
    </>
  ),
  nudge: (
    <>
      <path
        d="M12 30V20q0-3 3-3t3 3v2h1v-4q0-3 3-3t3 3v4h1v-3q0-3 3-3t3 3v4h1v-2q0-2.5 2.5-2.5T38 22v8c0 7-5 10-12 10h-3c-6 0-11-4-11-10z"
        style={paint('yellow', 'ink')}
      />
      <path d="M31 36c-4 1-8 0-10-2" style={paint('none', 'ink', 2)} />
      <path d="M9 9q4 2 5 6M14 6q1 4 4 7" style={paint('none', 'red', 2.6)} />
    </>
  ),
}

/** One sticker, sized by its class. Decorative: the button or line holding it names it. */
export function Sticker({ id, className = '' }: { id: StickerId; className?: string }) {
  return (
    <svg className={`sticker ${className}`} viewBox="0 0 48 48" aria-hidden focusable="false">
      <circle cx="24" cy="24" r="22" style={paint('paper', 'ink', 2.5)} />
      {DRAWINGS[id]}
    </svg>
  )
}

/** The talk button's mark: a speech balloon with three dots, in the button's own colour. */
export function TalkGlyph() {
  return (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M4 5h16v10H10l-5 4v-4H4z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="9" cy="10" r="1.3" fill="currentColor" />
      <circle cx="12.5" cy="10" r="1.3" fill="currentColor" />
      <circle cx="16" cy="10" r="1.3" fill="currentColor" />
    </svg>
  )
}
