import { describe, expect, it } from 'vitest'
import { TRAY_CLOSED_FRAME, trayFrame } from '../src/main/tray-frame'

const WORK = 20 * 60_000

describe('trayFrame', () => {
  it('starts with the eye open and lowers the lid as the work period runs out', () => {
    expect(trayFrame({ phase: 'working', msUntilBreak: WORK }, WORK)).toBe(0)
    expect(trayFrame({ phase: 'working', msUntilBreak: WORK / 2 }, WORK)).toBe(4)
    expect(trayFrame({ phase: 'working', msUntilBreak: 1_000 }, WORK)).toBe(7)
    expect(trayFrame({ phase: 'working', msUntilBreak: 0 }, WORK)).toBe(7)
  })

  it('never decreases while working', () => {
    let prev = 0
    for (let left = WORK; left >= 0; left -= 10_000) {
      const f = trayFrame({ phase: 'working', msUntilBreak: left }, WORK)
      expect(f).toBeGreaterThanOrEqual(prev)
      prev = f
    }
  })

  it('closes the eye during a break', () => {
    expect(trayFrame({ phase: 'break', msUntilBreakEnd: 5_000 }, WORK)).toBe(TRAY_CLOSED_FRAME)
  })

  it('opens the eye while paused or snoozed', () => {
    expect(trayFrame({ phase: 'idle' }, WORK)).toBe(0)
    expect(
      trayFrame({ phase: 'suspended', suspendReason: 'snooze', suspendedUntil: 1 }, WORK),
    ).toBe(0)
  })

  it('handles out-of-range input', () => {
    expect(trayFrame({ phase: 'working', msUntilBreak: WORK * 2 }, WORK)).toBe(0)
    expect(trayFrame({ phase: 'working', msUntilBreak: -5 }, WORK)).toBe(7)
    expect(trayFrame({ phase: 'working' }, 0)).toBe(0)
  })
})
