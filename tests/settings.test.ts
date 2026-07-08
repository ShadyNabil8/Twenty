import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/shared/defaults'
import { SettingsStore, validateSettings } from '../src/main/settings'

describe('validateSettings', () => {
  it('returns defaults for garbage input', () => {
    expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(validateSettings('nope')).toEqual(DEFAULT_SETTINGS)
    expect(validateSettings({ workMinutes: 'twenty' })).toEqual(DEFAULT_SETTINGS)
  })

  it('clamps numeric fields into their limits', () => {
    const s = validateSettings({
      workMinutes: 0,
      breakSeconds: 100_000,
      overlayOpacity: 0.01,
      hintLeadSeconds: -5,
      idlePauseMinutes: 9999,
    })
    expect(s.workMinutes).toBe(1)
    expect(s.breakSeconds).toBe(600)
    expect(s.overlayOpacity).toBe(0.3)
    expect(s.hintLeadSeconds).toBe(5)
    expect(s.idlePauseMinutes).toBe(120)
  })

  it('cleans the message list and falls back to defaults when empty', () => {
    const s = validateSettings({ messages: ['  keep me  ', '', 42, '   '] })
    expect(s.messages).toEqual(['keep me'])
    expect(validateSettings({ messages: [] }).messages).toEqual(DEFAULT_SETTINGS.messages)
    expect(validateSettings({ messages: 'x' }).messages).toEqual(DEFAULT_SETTINGS.messages)
  })

  it('keeps valid values unchanged', () => {
    const s = validateSettings({ workMinutes: 45, skippable: false, soundEnabled: false })
    expect(s.workMinutes).toBe(45)
    expect(s.skippable).toBe(false)
    expect(s.soundEnabled).toBe(false)
  })
})

describe('SettingsStore', () => {
  let dir: string
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('persists patches and reloads them', () => {
    dir = mkdtempSync(join(tmpdir(), 'eye-settings-'))
    const store = new SettingsStore(dir)
    store.set({ workMinutes: 30, skippable: false })

    const reloaded = new SettingsStore(dir)
    expect(reloaded.get().workMinutes).toBe(30)
    expect(reloaded.get().skippable).toBe(false)
    // File on disk is valid JSON.
    expect(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')).workMinutes).toBe(30)
  })

  it('reset (null patch) restores defaults', () => {
    dir = mkdtempSync(join(tmpdir(), 'eye-settings-'))
    const store = new SettingsStore(dir)
    store.set({ workMinutes: 55 })
    expect(store.set(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('notifies listeners on change', () => {
    dir = mkdtempSync(join(tmpdir(), 'eye-settings-'))
    const store = new SettingsStore(dir)
    let seen = 0
    store.onChange(() => seen++)
    store.set({ breakSeconds: 30 })
    expect(seen).toBe(1)
  })

  it('round-trips suspend state and rejects junk', () => {
    dir = mkdtempSync(join(tmpdir(), 'eye-settings-'))
    const store = new SettingsStore(dir)
    expect(store.readSuspendState()).toBeNull()

    store.writeSuspendState({ until: 123456, reason: 'snooze' })
    expect(store.readSuspendState()).toEqual({ until: 123456, reason: 'snooze' })

    store.writeSuspendState(null)
    expect(store.readSuspendState()).toBeNull()
  })
})
