import { type RuleOverrides, type RuleSet, TRADITIONAL, diffRules } from '../engine'

type Choice<K extends keyof RuleSet> = { value: RuleSet[K]; label: string }

export type RuleInfo = {
  [K in keyof RuleSet]: {
    key: K
    label: string
    /** Present for settings chosen from a list; absent for numbers. */
    choices?: Choice<K>[]
    range?: { min: number; max: number; unit: string }
  }
}[keyof RuleSet]

const onOff = (on: string, off: string): Choice<'double'>[] => [
  { value: true, label: on },
  { value: false, label: off },
]

/** Every setting, in the order the rules sheet and editor show them. */
export const RULE_INFO: RuleInfo[] = [
  { key: 'thuneeCaller', label: 'Who may call Thunee', choices: [{ value: 'anyone', label: 'Anyone' }, { value: 'trumperOnly', label: 'Only the trumper' }] },
  { key: 'thuneeTrump', label: 'Trump in a Thunee', choices: [{ value: 'firstCardLed', label: "The caller's first card" }, { value: 'noTrump', label: 'No trump' }] },
  { key: 'thuneeLeader', label: 'Who leads a Thunee', choices: [{ value: 'caller', label: 'The caller' }, { value: 'afterCaller', label: 'The player after the caller' }] },
  { key: 'thuneeWinner', label: 'A Thunee must be won by', choices: [{ value: 'callerOnly', label: 'The caller alone' }, { value: 'team', label: 'Either partner' }] },
  { key: 'thuneePartnerCatchBalls', label: 'Balls for a partner catch', range: { min: 1, max: 12, unit: 'balls' } },
  { key: 'jodhiTiming', label: 'When Jodhi can be called', choices: [{ value: 'firstAndThird', label: "After your team's 1st or 3rd trick" }, { value: 'anyTrick', label: 'After any trick your team wins' }] },
  { key: 'jodhiCards', label: 'A Jodhi counts if the cards', choices: [{ value: 'inHand', label: 'Are still in hand' }, { value: 'dealt', label: 'Were dealt to you' }] },
  { key: 'lastTrick', label: 'Last trick', choices: [{ value: 'transfer', label: 'Winner takes 10 from the loser' }, { value: 'bonus', label: 'Winner gains 10' }] },
  { key: 'defaultTrumper', label: 'Trumper when nobody calls', choices: [{ value: 'dealerRight', label: "The dealer's right" }, { value: 'teamAhead', label: 'The team that is ahead' }] },
  { key: 'dealerRotation', label: 'The deal passes on', choices: [{ value: 'stayWhileBehind', label: "Unless the dealer's team is behind" }, { value: 'always', label: 'Every round' }] },
  { key: 'khanaak', label: 'Khanaak', choices: [{ value: 'strict', label: 'Strict conditions' }, { value: 'simple', label: 'Simple conditions' }] },
  { key: 'khanaakRaisesTarget', label: 'A Khanaak call makes it a 13-ball game', choices: onOff('Yes', 'No') as never },
  { key: 'double', label: 'Double', choices: onOff('Allowed', 'Not played') },
  { key: 'undercutRestriction', label: 'Undercutting a trump', choices: onOff('Only with a hand of trumps', 'Always allowed') as never },
  { key: 'allowCheating', label: 'Cheating', choices: onOff('Allowed, and can be challenged', 'Not allowed') as never },
  { key: 'redealIfNoTrumps', label: 'Counting team holds no trump', choices: onOff('Redeal', 'Play on') as never },
  { key: 'ballsToWin', label: 'Balls to win', range: { min: 1, max: 30, unit: 'balls' } },
  { key: 'twoToClear', label: 'Must win by two balls', choices: onOff('Yes', 'No') as never },
  { key: 'twoPlayerTarget', label: 'Two-player counting target', range: { min: 50, max: 250, unit: 'points' } },
  { key: 'callTimerSeconds', label: 'Time to call', range: { min: 3, max: 60, unit: 'seconds' } },
  { key: 'thuneeWindowSeconds', label: 'Time to call Thunee', range: { min: 0, max: 30, unit: 'seconds' } },
]

export function valueLabel(info: RuleInfo, value: RuleSet[keyof RuleSet]): string {
  if (info.choices) return (info.choices as Choice<keyof RuleSet>[]).find((c) => c.value === value)?.label ?? String(value)
  return `${value} ${info.range?.unit ?? ''}`.trim()
}

/** How many settings differ from Traditional. */
export function differenceCount(rules: RuleSet): number {
  return Object.keys(diffRules(rules)).length
}

export function isTraditional(key: keyof RuleSet, rules: RuleSet): boolean {
  return rules[key] === TRADITIONAL[key]
}

export function sameOverrides(a: RuleOverrides, b: RuleOverrides): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof RuleSet>
  return [...keys].every((k) => (a[k] ?? TRADITIONAL[k]) === (b[k] ?? TRADITIONAL[k]))
}
