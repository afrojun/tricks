/** Spades' house rules for the screens: Standard, the Jokers preset, and how each rule is described. */
import { JOKERS_OVERRIDES, STANDARD, type SpadesRules, ruleOverridesSchema } from '../engine'
import type { RuleBook, RuleInfo } from '../../../presets/book'

const onOff = (on: string, off: string) => [
  { value: true, label: on },
  { value: false, label: off },
]

/** Every setting, in the order the rules sheet and editor show them. */
const RULE_INFO: RuleInfo<SpadesRules>[] = [
  { key: 'gameEndsAt', label: 'The game ends at', range: { min: 100, max: 1000, unit: 'points', step: 50 } },
  { key: 'nil', label: 'Nil', choices: onOff('Allowed, for 100', 'Not allowed') },
  { key: 'blindNil', label: 'Blind nil', choices: onOff('Allowed, for 200, when 100 behind', 'Not allowed') },
  { key: 'bagPenalty', label: 'Bags', choices: onOff('Ten cost 100', 'No penalty') },
  {
    key: 'firstLead',
    label: 'The first lead, with four',
    choices: [
      { value: 'left', label: 'The player left of the dealer' },
      { value: 'lowestClub', label: 'The two of clubs' },
    ],
  },
  {
    key: 'renege',
    label: 'A caught renege',
    choices: [
      { value: 'set', label: 'Sets the side, and ends the round' },
      { value: 'bidPlusThree', label: 'Adds three tricks to its call' },
    ],
  },
  { key: 'jokers', label: 'Jokers', choices: onOff('Two jokers and two twos are the top trumps', 'Not used') },
  { key: 'allowCheating', label: 'Cheating', choices: onOff('Allowed, and can be challenged', 'Not allowed') },
]

export const ruleBook: RuleBook<SpadesRules> = {
  defaults: STANDARD,
  schema: ruleOverridesSchema,
  presets: [
    { id: 'standard', name: 'Standard', overrides: {} },
    { id: 'jokers', name: 'Jokers', overrides: JOKERS_OVERRIDES },
  ],
  info: RULE_INFO,
}
