import type { SuspendReason, SuspendState, TimerSnapshot } from '../shared/types'

export interface TimerConfig {
  workMs: number
  breakMs: number
  hintEnabled: boolean
  hintLeadMs: number
  idlePauseMs: number
  skippable: boolean
}

export type BreakEndReason = 'completed' | 'skipped' | 'forced' | 'preempted'

export type TimerEvent =
  | { type: 'hint'; breakAt: number }
  | { type: 'hint-cancel' }
  | { type: 'break-start'; endsAt: number }
  | { type: 'break-end'; reason: BreakEndReason }
  | { type: 'phase-change' }

interface WorkingPhase {
  kind: 'working'
  breakAt: number
  hintAt: number | null
  hintFired: boolean
}
interface BreakPhase {
  kind: 'break'
  endsAt: number
}
interface IdlePhase {
  kind: 'idle'
  since: number
}
interface SuspendedPhase {
  kind: 'suspended'
  until: number
  reason: SuspendReason
}
type Phase = WorkingPhase | BreakPhase | IdlePhase | SuspendedPhase

/**
 * Pure, tick-driven timer state machine. No wall clock, no Electron, no side
 * effects: the host calls tick()/reportIdle() with timestamps and executes the
 * returned events. This keeps every transition unit-testable.
 *
 * Phases: working → (hint) → break → working, plus idle (auto-pause on user
 * inactivity) and suspended (snooze / pause-until-tomorrow).
 */
export class TimerEngine {
  private phase: Phase
  private cfg: TimerConfig
  private lastTickAt: number

  constructor(cfg: TimerConfig, now: number, restoredSuspend?: SuspendState | null) {
    this.cfg = cfg
    this.lastTickAt = now
    this.phase =
      restoredSuspend && restoredSuspend.until > now
        ? { kind: 'suspended', until: restoredSuspend.until, reason: restoredSuspend.reason }
        : this.freshWork(now)
  }

  private freshWork(now: number): WorkingPhase {
    const breakAt = now + this.cfg.workMs
    const hintAt = this.cfg.hintEnabled ? Math.max(now, breakAt - this.cfg.hintLeadMs) : null
    return { kind: 'working', breakAt, hintAt, hintFired: false }
  }

  private beginBreak(now: number): TimerEvent[] {
    const endsAt = now + this.cfg.breakMs
    this.phase = { kind: 'break', endsAt }
    return [{ type: 'break-start', endsAt }, { type: 'phase-change' }]
  }

  private endBreak(now: number, reason: BreakEndReason): TimerEvent[] {
    this.phase = this.freshWork(now)
    return [{ type: 'break-end', reason }, { type: 'phase-change' }]
  }

  tick(now: number): TimerEvent[] {
    const gap = now - this.lastTickAt
    this.lastTickAt = now
    const events: TimerEvent[] = []

    switch (this.phase.kind) {
      case 'working': {
        // A tick gap longer than the idle threshold means the system slept or
        // the process was frozen. Treat it like an idle return: restart the
        // work period instead of slamming a break the moment the user is back.
        if (gap >= this.cfg.idlePauseMs) {
          if (this.phase.hintFired) events.push({ type: 'hint-cancel' })
          this.phase = this.freshWork(now)
          events.push({ type: 'phase-change' })
          break
        }
        if (now >= this.phase.breakAt) {
          if (this.phase.hintFired) events.push({ type: 'hint-cancel' })
          events.push(...this.beginBreak(now))
          break
        }
        if (this.phase.hintAt !== null && !this.phase.hintFired && now >= this.phase.hintAt) {
          this.phase.hintFired = true
          events.push({ type: 'hint', breakAt: this.phase.breakAt })
        }
        break
      }
      case 'break': {
        if (now >= this.phase.endsAt) events.push(...this.endBreak(now, 'completed'))
        break
      }
      case 'suspended': {
        if (now >= this.phase.until) {
          this.phase = this.freshWork(now)
          events.push({ type: 'phase-change' })
        }
        break
      }
      case 'idle':
        // Exits only via reportIdle (fresh activity resets the idle counter).
        break
    }
    return events
  }

  /** Feed the OS idle time (ms since last keyboard/mouse input). */
  reportIdle(idleMs: number, now: number): TimerEvent[] {
    const events: TimerEvent[] = []
    if (this.phase.kind === 'working') {
      if (idleMs >= this.cfg.idlePauseMs) {
        if (this.phase.hintFired) events.push({ type: 'hint-cancel' })
        this.phase = { kind: 'idle', since: now - idleMs }
        events.push({ type: 'phase-change' })
      }
    } else if (this.phase.kind === 'idle') {
      if (idleMs < this.cfg.idlePauseMs) {
        // The user is back after a natural away-break: start a fresh period.
        this.phase = this.freshWork(now)
        events.push({ type: 'phase-change' })
      }
    }
    return events
  }

  /** Tray action: start the break immediately (also resumes from idle/suspend). */
  startBreakNow(now: number): TimerEvent[] {
    if (this.phase.kind === 'break') return []
    const events: TimerEvent[] = []
    if (this.phase.kind === 'working' && this.phase.hintFired) events.push({ type: 'hint-cancel' })
    events.push(...this.beginBreak(now))
    return events
  }

  /** User skip (Esc). Honors the skippable setting. */
  skip(now: number): TimerEvent[] {
    if (this.phase.kind !== 'break' || !this.cfg.skippable) return []
    return this.endBreak(now, 'skipped')
  }

  /** Anti-lockout safety hatch: always ends a break, even when not skippable. */
  forceEndBreak(now: number): TimerEvent[] {
    if (this.phase.kind !== 'break') return []
    return this.endBreak(now, 'forced')
  }

  /** Snooze / pause-until-tomorrow. Ends an in-progress break first. */
  suspend(until: number, reason: SuspendReason, _now: number): TimerEvent[] {
    const events: TimerEvent[] = []
    if (this.phase.kind === 'break') {
      events.push({ type: 'break-end', reason: 'preempted' })
    } else if (this.phase.kind === 'working' && this.phase.hintFired) {
      events.push({ type: 'hint-cancel' })
    }
    this.phase = { kind: 'suspended', until, reason }
    events.push({ type: 'phase-change' })
    return events
  }

  resume(now: number): TimerEvent[] {
    if (this.phase.kind !== 'suspended' && this.phase.kind !== 'idle') return []
    this.phase = this.freshWork(now)
    return [{ type: 'phase-change' }]
  }

  /**
   * Apply new durations. Restarts the current work period so the change takes
   * effect predictably; an in-progress break or suspension is left to finish.
   */
  applyConfig(cfg: TimerConfig, now: number): TimerEvent[] {
    this.cfg = cfg
    if (this.phase.kind !== 'working') return []
    const events: TimerEvent[] = []
    if (this.phase.hintFired) events.push({ type: 'hint-cancel' })
    this.phase = this.freshWork(now)
    events.push({ type: 'phase-change' })
    return events
  }

  get phaseKind(): Phase['kind'] {
    return this.phase.kind
  }

  /** Current suspension for persistence across restarts, or null. */
  get suspension(): SuspendState | null {
    return this.phase.kind === 'suspended'
      ? { until: this.phase.until, reason: this.phase.reason }
      : null
  }

  snapshot(now: number): TimerSnapshot {
    switch (this.phase.kind) {
      case 'working':
        return { phase: 'working', msUntilBreak: Math.max(0, this.phase.breakAt - now) }
      case 'break':
        return { phase: 'break', msUntilBreakEnd: Math.max(0, this.phase.endsAt - now) }
      case 'idle':
        return { phase: 'idle' }
      case 'suspended':
        return {
          phase: 'suspended',
          suspendedUntil: this.phase.until,
          suspendReason: this.phase.reason,
        }
    }
  }
}

/** Midnight at the start of the next local calendar day. */
export function nextLocalMidnight(now: number): number {
  const d = new Date(now)
  d.setHours(24, 0, 0, 0)
  return d.getTime()
}
