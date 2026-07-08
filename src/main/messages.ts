import { DEFAULT_MESSAGES } from '../shared/defaults'

/**
 * Returns a picker that chooses a random message, never repeating the
 * previous pick when more than one message is configured.
 */
export function createMessagePicker(rng: () => number = Math.random) {
  let last = ''
  return (messages: readonly string[]): string => {
    const pool = messages.length > 0 ? messages : DEFAULT_MESSAGES
    const first = pool[0]
    if (pool.length === 1 && first !== undefined) return first
    const candidates = pool.filter((m) => m !== last)
    const pick = candidates[Math.floor(rng() * candidates.length)] ?? first ?? ''
    last = pick
    return pick
  }
}
