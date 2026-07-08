import { join } from 'node:path'
import { DEFAULT_SETTINGS, LIMITS } from '../shared/defaults'
import type { Settings, SuspendState } from '../shared/types'
import { readJson, writeJson } from './persist'

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, n))
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function messageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.messages]
  const cleaned = value
    .filter((m): m is string => typeof m === 'string')
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
    .slice(0, 100)
  return cleaned.length > 0 ? cleaned : [...DEFAULT_SETTINGS.messages]
}

/** Coerce arbitrary input into a valid Settings object (clamping numbers, etc.). */
export function validateSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_SETTINGS
  return {
    version: 1,
    workMinutes: clamp(r.workMinutes, LIMITS.workMinutes.min, LIMITS.workMinutes.max, d.workMinutes),
    breakSeconds: clamp(
      r.breakSeconds,
      LIMITS.breakSeconds.min,
      LIMITS.breakSeconds.max,
      d.breakSeconds,
    ),
    overlayOpacity: clamp(
      r.overlayOpacity,
      LIMITS.overlayOpacity.min,
      LIMITS.overlayOpacity.max,
      d.overlayOpacity,
    ),
    messages: messageList(r.messages),
    skippable: bool(r.skippable, d.skippable),
    hintEnabled: bool(r.hintEnabled, d.hintEnabled),
    hintLeadSeconds: clamp(
      r.hintLeadSeconds,
      LIMITS.hintLeadSeconds.min,
      LIMITS.hintLeadSeconds.max,
      d.hintLeadSeconds,
    ),
    soundEnabled: bool(r.soundEnabled, d.soundEnabled),
    idlePauseMinutes: clamp(
      r.idlePauseMinutes,
      LIMITS.idlePauseMinutes.min,
      LIMITS.idlePauseMinutes.max,
      d.idlePauseMinutes,
    ),
    openAtLogin: bool(r.openAtLogin, d.openAtLogin),
  }
}

/**
 * File-backed settings + timer suspend state. Deliberately Electron-free
 * (takes a directory) so it stays unit-testable.
 */
export class SettingsStore {
  private readonly settingsPath: string
  private readonly statePath: string
  private current: Settings
  private listeners = new Set<(s: Settings) => void>()

  constructor(dir: string) {
    this.settingsPath = join(dir, 'settings.json')
    this.statePath = join(dir, 'state.json')
    this.current = validateSettings(readJson(this.settingsPath))
  }

  get(): Settings {
    return this.current
  }

  /** Apply a partial patch (or null to reset to defaults). Returns the result. */
  set(patch: Partial<Settings> | null): Settings {
    this.current = validateSettings(patch === null ? {} : { ...this.current, ...patch })
    writeJson(this.settingsPath, this.current)
    for (const fn of this.listeners) fn(this.current)
    return this.current
  }

  onChange(fn: (s: Settings) => void): void {
    this.listeners.add(fn)
  }

  readSuspendState(): SuspendState | null {
    const raw = readJson(this.statePath)
    if (!raw || typeof raw !== 'object') return null
    const s = raw as Record<string, unknown>
    if (
      typeof s.until === 'number' &&
      Number.isFinite(s.until) &&
      (s.reason === 'snooze' || s.reason === 'until-tomorrow')
    ) {
      return { until: s.until, reason: s.reason }
    }
    return null
  }

  writeSuspendState(state: SuspendState | null): void {
    writeJson(this.statePath, state)
  }
}
