import { describe, expect, test } from 'vitest'
import { rejectionText } from './text'

describe('why an action was refused', () => {
  const own = { notYourTurn: "It isn't your turn." }

  test('the game words its own reasons', () => {
    expect(rejectionText('notYourTurn', own)).toBe("It isn't your turn.")
  })

  test('the shell words the table’s reasons and a message the room could not read', () => {
    expect(rejectionText('notHost', own)).toBe('Only the host can do that.')
    expect(rejectionText('seatsNotFilled', {})).toBe('Fill every seat before starting.')
    expect(rejectionText('malformed', own)).toBe("The server didn't understand that. Reload and try again.")
  })

  test('anything else reads as a plain refusal', () => {
    for (const reason of ['notYourTurn', 'somethingNew', 'constructor', 'toString']) {
      expect(rejectionText(reason, {})).toBe("You can't do that right now.")
    }
  })
})
