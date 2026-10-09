/** Thunee's house rules for the screens: Traditional, the built-in presets, and how each rule is described. */
import { type RuleSet, TRADITIONAL, TUSCANS_OVERRIDES, ruleOverridesSchema } from '../engine'
import type { RuleBook, RuleInfo } from '../../../presets/book'

const onOff = (on: string, off: string) => [
  { value: true, label: on },
  { value: false, label: off },
]

/** Every setting, in the order the rules sheet and editor show them. */
const RULE_INFO: RuleInfo<RuleSet>[] = [
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
  { key: 'khanaakRaisesTarget', label: 'A Khanaak call makes it a 13-ball game', choices: onOff('Yes', 'No') },
  { key: 'double', label: 'Double', choices: onOff('Allowed', 'Not played') },
  { key: 'undercutRestriction', label: 'Undercutting a trump', choices: onOff('Only with a hand of trumps', 'Always allowed') },
  { key: 'allowCheating', label: 'Cheating', choices: onOff('Allowed, and can be challenged', 'Not allowed') },
  { key: 'redealIfNoTrumps', label: 'Counting team holds no trump', choices: onOff('Redeal', 'Play on') },
  { key: 'ballsToWin', label: 'Balls to win', range: { min: 1, max: 30, unit: 'balls' } },
  { key: 'twoToClear', label: 'Must win by two balls', choices: onOff('Yes', 'No') },
  { key: 'twoPlayerTarget', label: 'Two-player counting target', range: { min: 50, max: 250, unit: 'points' } },
  { key: 'timers', label: 'Time limits on calling, Thunee and Jodhi', choices: onOff('On', 'Off: the table waits for everyone') },
  { key: 'callTimerSeconds', label: 'Time to call', range: { min: 3, max: 60, unit: 'seconds' } },
  { key: 'thuneeWindowSeconds', label: 'Time to call Thunee', range: { min: 0, max: 30, unit: 'seconds' } },
]

export const ruleBook: RuleBook<RuleSet> = {
  defaults: TRADITIONAL,
  schema: ruleOverridesSchema,
  presets: [
    { id: 'traditional', name: 'Traditional', overrides: {} },
    { id: 'tuscans', name: 'Tuscans', overrides: TUSCANS_OVERRIDES },
  ],
  info: RULE_INFO,
}
