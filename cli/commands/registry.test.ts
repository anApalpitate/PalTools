import { describe, expect, it } from 'vitest'
import { COMMAND_HANDLERS } from './registry'

describe('COMMAND_HANDLERS', () => {
  it('registers every data command exactly once', () => {
    const expected = ['info', 'search', 'forward', 'reverse']
    for (const kind of expected) {
      expect(COMMAND_HANDLERS.has(kind)).toBe(true)
    }
    expect(COMMAND_HANDLERS.size).toBe(expected.length)
  })
})
