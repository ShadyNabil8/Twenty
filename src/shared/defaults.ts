import type { Settings } from './types'

export const DEFAULT_MESSAGES: readonly string[] = [
  'Look at something 20 feet (6 meters) away.',
  'Focus on the farthest object you can see.',
  'Blink slowly ten times to refresh your eyes.',
  'Look out a window and let your eyes wander.',
  'Roll your eyes gently — up, around, and down.',
  'Close your eyes and take three deep breaths.',
  'Trace the edges of the room with your gaze.',
  'Relax your shoulders and soften your focus.',
]

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  workMinutes: 20,
  breakSeconds: 20,
  overlayOpacity: 0.92,
  messages: [...DEFAULT_MESSAGES],
  skippable: true,
  hintEnabled: true,
  hintLeadSeconds: 30,
  soundEnabled: true,
  idlePauseMinutes: 5,
  openAtLogin: false,
}

export const LIMITS = {
  workMinutes: { min: 1, max: 240 },
  breakSeconds: { min: 5, max: 600 },
  overlayOpacity: { min: 0.3, max: 1 },
  hintLeadSeconds: { min: 5, max: 300 },
  idlePauseMinutes: { min: 1, max: 120 },
} as const

/** Overlay fade-in duration (README: smooth 2–3 second fade). */
export const FADE_IN_MS = 2500
export const FADE_OUT_MS = 800
/** Holding Esc this long always ends a break — anti-lockout safety hatch. */
export const ESC_HOLD_MS = 3000
export const SNOOZE_MS = 60 * 60 * 1000
