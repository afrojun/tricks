/** Hearts' house rules for the screens: Standard, the built-in presets, and how each rule is described. */
import { type HeartsRules, OMNIBUS_OVERRIDES, STANDARD, ruleOverridesSchema } from '../engine'
import type { RuleBook, RuleInfo } from '../../../presets/book'

const onOff = (on: string, off: string) => [
  { value: true, label: on },
  { value: false, label: off },
]

/** Every setting, in the order the rules sheet and editor show them. */
const RULE_INFO: RuleInfo<HeartsRules>[] = [
  { key: 'gameEndsAt', label: 'The game ends at', range: { min: 25, max: 500, unit: 'points', step: 25 } },
  {
    key: 'passing',
    label: 'Passing',
    choices: [
      { value: 'rotating', label: 'Left, right, across, then none' },
      { value: 'left', label: 'Always to the left' },
      { value: 'none', label: 'No passing' },
    ],
  },
  {
    key: 'moon',
    label: 'Shooting the moon',
    choices: [
      { value: 'othersAdd', label: 'Everyone else takes 26' },
      { value: 'shooterSubtracts', label: 'The shooter takes off 26' },
    ],
  },
  { key: 'jackOfDiamonds', label: 'The jack of diamonds', choices: onOff('Worth minus 10', 'Worth nothing') },
  { key: 'queenBreaksHearts', label: 'The queen of spades breaks hearts', choices: onOff('Yes', 'No') },
  { key: 'pointsOnFirstTrick', label: 'Points on the first trick', choices: onOff('Allowed', 'Not allowed') },
  { key: 'allowCheating', label: 'Cheating', choices: onOff('Allowed, and can be challenged', 'Not allowed') },
]

export const ruleBook: RuleBook<HeartsRules> = {
  defaults: STANDARD,
  schema: ruleOverridesSchema,
  presets: [
    { id: 'standard', name: 'Standard', overrides: {} },
    { id: 'omnibus', name: 'Omnibus', overrides: OMNIBUS_OVERRIDES },
  ],
  info: RULE_INFO,
}
