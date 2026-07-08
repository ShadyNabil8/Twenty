import { describe, expect, it } from 'vitest'
import { DEFAULT_MESSAGES } from '../src/shared/defaults'
import { createMessagePicker } from '../src/main/messages'

describe('createMessagePicker', () => {
  it('never repeats the previous message when several are configured', () => {
    const pick = createMessagePicker()
    const messages = ['a', 'b', 'c']
    let prev = pick(messages)
    for (let i = 0; i < 200; i++) {
      const next = pick(messages)
      expect(next).not.toBe(prev)
      expect(messages).toContain(next)
      prev = next
    }
  })

  it('returns the single message when only one is configured', () => {
    const pick = createMessagePicker()
    expect(pick(['only'])).toBe('only')
    expect(pick(['only'])).toBe('only')
  })

  it('falls back to default messages for an empty list', () => {
    const pick = createMessagePicker()
    expect(DEFAULT_MESSAGES).toContain(pick([]))
  })
})
