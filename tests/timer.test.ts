import { describe, expect, it } from 'vitest'
import { TimerEngine, nextLocalMidnight, type TimerConfig, type TimerEvent } from '../src/main/timer'

const MIN = 60_000
const cfg: TimerConfig = {
  workMs: 20 * MIN,
  breakMs: 20_000,
  hintEnabled: true,
  hintLeadMs: 30_000,
  idlePauseMs: 5 * MIN,
  skippable: true,
}

const T0 = 1_000_000_000_000

function types(events: TimerEvent[]): string[] {
  return events.map((e) => e.type)
}

/** Tick the engine every second from `from` to `to`, collecting events. */
function run(engine: TimerEngine, from: number, to: number): TimerEvent[] {
  const out: TimerEvent[] = []
  for (let t = from; t <= to; t += 1000) out.push(...engine.tick(t))
  return out
}

describe('TimerEngine core cycle', () => {
  it('fires hint at lead time, then break, then returns to working', () => {
    const e = new TimerEngine(cfg, T0)
    expect(e.phaseKind).toBe('working')

    // Nothing before the hint moment.
    expect(run(e, T0, T0 + 20 * MIN - 31_000)).toEqual([])

    const hintEvents = e.tick(T0 + 20 * MIN - 30_000)
    expect(types(hintEvents)).toEqual(['hint'])

    const breakEvents = e.tick(T0 + 20 * MIN)
    expect(types(breakEvents)).toEqual(['hint-cancel', 'break-start', 'phase-change'])
    expect(e.phaseKind).toBe('break')

    // Break completes after breakMs.
    expect(types(e.tick(T0 + 20 * MIN + 19_000))).toEqual([])
    const endEvents = e.tick(T0 + 20 * MIN + 20_000)
    expect(types(endEvents)).toEqual(['break-end', 'phase-change'])
    expect(endEvents[0]).toMatchObject({ reason: 'completed' })
    expect(e.phaseKind).toBe('working')

    // The cycle repeats: next break is one work period after the last end.
    expect(e.snapshot(T0 + 20 * MIN + 20_000).msUntilBreak).toBe(20 * MIN)
  })

  it('does not fire a hint when hints are disabled', () => {
    const e = new TimerEngine({ ...cfg, hintEnabled: false }, T0)
    const events = run(e, T0, T0 + 20 * MIN)
    expect(types(events)).toEqual(['break-start', 'phase-change'])
  })

  it('fires the hint immediately when the lead exceeds the work period', () => {
    const e = new TimerEngine({ ...cfg, workMs: 10_000, hintLeadMs: 60_000 }, T0)
    expect(types(e.tick(T0 + 1000))).toEqual(['hint'])
  })
})

describe('skip and force-end', () => {
  function inBreak(overrides: Partial<TimerConfig> = {}): TimerEngine {
    const e = new TimerEngine({ ...cfg, ...overrides }, T0)
    e.startBreakNow(T0 + 1000)
    expect(e.phaseKind).toBe('break')
    return e
  }

  it('skip ends the break when skippable', () => {
    const e = inBreak()
    const events = e.skip(T0 + 2000)
    expect(events[0]).toMatchObject({ type: 'break-end', reason: 'skipped' })
    expect(e.phaseKind).toBe('working')
  })

  it('skip is ignored when not skippable', () => {
    const e = inBreak({ skippable: false })
    expect(e.skip(T0 + 2000)).toEqual([])
    expect(e.phaseKind).toBe('break')
  })

  it('forceEndBreak works even when not skippable (safety hatch)', () => {
    const e = inBreak({ skippable: false })
    const events = e.forceEndBreak(T0 + 2000)
    expect(events[0]).toMatchObject({ type: 'break-end', reason: 'forced' })
    expect(e.phaseKind).toBe('working')
  })

  it('skip/forceEnd are no-ops outside a break', () => {
    const e = new TimerEngine(cfg, T0)
    expect(e.skip(T0 + 1000)).toEqual([])
    expect(e.forceEndBreak(T0 + 1000)).toEqual([])
  })
})

describe('idle detection', () => {
  it('pauses when idle exceeds the threshold and restarts work on return', () => {
    const e = new TimerEngine(cfg, T0)
    // 10 minutes in, user goes idle for 5 minutes.
    const t1 = T0 + 10 * MIN
    expect(types(e.reportIdle(5 * MIN, t1))).toEqual(['phase-change'])
    expect(e.phaseKind).toBe('idle')

    // No breaks fire while idle, even past the original break time.
    expect(run(e, t1, T0 + 30 * MIN)).toEqual([])

    // User returns: fresh full work period, not an immediate break.
    const t2 = T0 + 30 * MIN
    expect(types(e.reportIdle(1000, t2))).toEqual(['phase-change'])
    expect(e.phaseKind).toBe('working')
    expect(e.snapshot(t2).msUntilBreak).toBe(20 * MIN)
  })

  it('cancels a visible hint when going idle', () => {
    const e = new TimerEngine(cfg, T0)
    const hintEvents = run(e, T0, T0 + 20 * MIN - 30_000) // hint fires along the way
    expect(types(hintEvents)).toEqual(['hint'])
    const events = e.reportIdle(5 * MIN, T0 + 20 * MIN - 25_000)
    expect(types(events)).toEqual(['hint-cancel', 'phase-change'])
  })

  it('ignores idle reports during a break (user is supposed to be idle)', () => {
    const e = new TimerEngine(cfg, T0)
    e.startBreakNow(T0)
    expect(e.reportIdle(10 * MIN, T0 + 10_000)).toEqual([])
    expect(e.phaseKind).toBe('break')
  })

  it('treats a huge tick gap (system sleep) as an idle return', () => {
    const e = new TimerEngine(cfg, T0)
    e.tick(T0 + 1000)
    // Laptop lid closed for an hour; next tick arrives much later.
    const events = e.tick(T0 + 61 * MIN)
    expect(types(events)).toEqual(['phase-change'])
    expect(e.phaseKind).toBe('working')
    expect(e.snapshot(T0 + 61 * MIN).msUntilBreak).toBe(20 * MIN)
  })
})

describe('suspension (snooze / pause until tomorrow)', () => {
  it('suspends and auto-resumes with a fresh work period', () => {
    const e = new TimerEngine(cfg, T0)
    const until = T0 + 60 * MIN
    expect(types(e.suspend(until, 'snooze', T0 + MIN))).toEqual(['phase-change'])
    expect(e.phaseKind).toBe('suspended')
    expect(e.suspension).toEqual({ until, reason: 'snooze' })

    // No hint/break fires while suspended.
    expect(run(e, T0 + MIN, until - 1000)).toEqual([])

    expect(types(e.tick(until))).toEqual(['phase-change'])
    expect(e.phaseKind).toBe('working')
  })

  it('suspending during a break ends it as preempted', () => {
    const e = new TimerEngine(cfg, T0)
    e.startBreakNow(T0)
    const events = e.suspend(T0 + 60 * MIN, 'snooze', T0 + 5000)
    expect(events[0]).toMatchObject({ type: 'break-end', reason: 'preempted' })
    expect(e.phaseKind).toBe('suspended')
  })

  it('manual resume returns to working immediately', () => {
    const e = new TimerEngine(cfg, T0)
    e.suspend(T0 + 60 * MIN, 'until-tomorrow', T0)
    expect(types(e.resume(T0 + MIN))).toEqual(['phase-change'])
    expect(e.phaseKind).toBe('working')
  })

  it('restores a persisted suspension on construction and expires it', () => {
    const until = T0 + 10 * MIN
    const e = new TimerEngine(cfg, T0, { until, reason: 'until-tomorrow' })
    expect(e.phaseKind).toBe('suspended')
    e.tick(until + 1000)
    expect(e.phaseKind).toBe('working')
  })

  it('ignores an already-expired persisted suspension', () => {
    const e = new TimerEngine(cfg, T0, { until: T0 - 1000, reason: 'snooze' })
    expect(e.phaseKind).toBe('working')
  })
})

describe('config changes', () => {
  it('restarts the work period with new durations', () => {
    const e = new TimerEngine(cfg, T0)
    run(e, T0, T0 + 5 * MIN)
    const events = e.applyConfig({ ...cfg, workMs: 10 * MIN }, T0 + 5 * MIN)
    expect(types(events)).toEqual(['phase-change'])
    expect(e.snapshot(T0 + 5 * MIN).msUntilBreak).toBe(10 * MIN)
  })

  it('leaves an in-progress break alone', () => {
    const e = new TimerEngine(cfg, T0)
    e.startBreakNow(T0)
    expect(e.applyConfig({ ...cfg, workMs: 10 * MIN }, T0 + 1000)).toEqual([])
    expect(e.phaseKind).toBe('break')
  })

  it('cancels a visible hint on config change', () => {
    const e = new TimerEngine(cfg, T0)
    const hintEvents = run(e, T0, T0 + 20 * MIN - 30_000)
    expect(types(hintEvents)).toEqual(['hint'])
    const events = e.applyConfig(cfg, T0 + 20 * MIN - 29_000)
    expect(types(events)).toEqual(['hint-cancel', 'phase-change'])
  })
})

describe('snapshot', () => {
  it('reports the correct fields per phase', () => {
    const e = new TimerEngine(cfg, T0)
    expect(e.snapshot(T0 + MIN)).toEqual({ phase: 'working', msUntilBreak: 19 * MIN })

    e.startBreakNow(T0 + MIN)
    expect(e.snapshot(T0 + MIN + 5000)).toEqual({ phase: 'break', msUntilBreakEnd: 15_000 })

    e.forceEndBreak(T0 + 2 * MIN)
    e.suspend(T0 + 90 * MIN, 'snooze', T0 + 2 * MIN)
    expect(e.snapshot(T0 + 3 * MIN)).toEqual({
      phase: 'suspended',
      suspendedUntil: T0 + 90 * MIN,
      suspendReason: 'snooze',
    })
  })
})

describe('nextLocalMidnight', () => {
  it('returns the start of the next local day', () => {
    const now = new Date(2026, 6, 7, 15, 30, 0).getTime()
    const midnight = nextLocalMidnight(now)
    const d = new Date(midnight)
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0])
    expect(d.getDate()).toBe(8)
    expect(midnight).toBeGreaterThan(now)
  })
})
