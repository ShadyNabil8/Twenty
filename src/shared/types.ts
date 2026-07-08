export interface Settings {
  version: 1
  /** Work period between breaks, in minutes. */
  workMinutes: number
  /** Break duration, in seconds. */
  breakSeconds: number
  /** Overlay background opacity, 0.3–1. */
  overlayOpacity: number
  /** Eye-care messages shown on the overlay and hint. */
  messages: string[]
  /** Whether the break can be skipped with Esc. */
  skippable: boolean
  /** Show a toast shortly before the break. */
  hintEnabled: boolean
  /** How long before the break the hint appears, in seconds. */
  hintLeadSeconds: number
  /** Play a soft chime when the break starts. */
  soundEnabled: boolean
  /** Pause the timer after this much keyboard/mouse inactivity, in minutes. */
  idlePauseMinutes: number
  /** Start the app when the user logs in. */
  openAtLogin: boolean
}

export type SuspendReason = 'snooze' | 'until-tomorrow'

export type PhaseKind = 'working' | 'break' | 'idle' | 'suspended'

export interface TimerSnapshot {
  phase: PhaseKind
  /** working: ms until the next break starts. */
  msUntilBreak?: number
  /** break: ms until the break ends. */
  msUntilBreakEnd?: number
  /** suspended: epoch ms when the timer resumes. */
  suspendedUntil?: number
  suspendReason?: SuspendReason
}

export interface SuspendState {
  until: number
  reason: SuspendReason
}
