import { describe, expect, it } from 'vitest'
import {
  dirFor,
  formatCountdown,
  isLanguage,
  LANGUAGES,
  localizeDigits,
  STRINGS,
} from '../src/shared/i18n'

function leaves(value: unknown, path = ''): [string, unknown][] {
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
  }
  return [[path, value]]
}

describe('i18n', () => {
  it('recognises only en and ar', () => {
    expect(LANGUAGES.every(isLanguage)).toBe(true)
    expect(isLanguage('fr')).toBe(false)
    expect(isLanguage(42)).toBe(false)
  })

  it('maps Arabic to RTL', () => {
    expect(dirFor('ar')).toBe('rtl')
    expect(dirFor('en')).toBe('ltr')
  })

  it('localizes digits and percent for Arabic only', () => {
    expect(localizeDigits('1:05', 'ar')).toBe('١:٠٥')
    expect(localizeDigits('92%', 'ar')).toBe('٩٢٪')
    expect(localizeDigits('1:05', 'en')).toBe('1:05')
  })

  it('formats countdowns', () => {
    expect(formatCountdown(65, 'en', true)).toBe('1:05')
    expect(formatCountdown(20, 'en', true)).toBe('20s')
    expect(formatCountdown(20, 'en', false)).toBe('20')
    expect(formatCountdown(20, 'ar', true)).toBe('٢٠ث')
    expect(formatCountdown(-3, 'ar', false)).toBe('٠')
  })

  it('has the same non-empty strings in every language', () => {
    const shape = leaves(STRINGS.en).map(([k]) => k)
    for (const lang of LANGUAGES) {
      const entries = leaves(STRINGS[lang])
      expect(entries.map(([k]) => k)).toEqual(shape)
      for (const [, v] of entries) {
        const text = typeof v === 'function' ? (v as (x: string) => string)('3') : v
        expect(typeof text === 'string' && text.length > 0).toBe(true)
      }
    }
  })
})
