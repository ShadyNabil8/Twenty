import { DEFAULT_SETTINGS } from '../../shared/defaults'
import {
  dirFor,
  isLanguage,
  localizeDigits,
  STRINGS,
  type SettingsStringKey,
} from '../../shared/i18n'
import type { Language, Settings } from '../../shared/types'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const form = $<HTMLFormElement>('form')
const workMinutes = $<HTMLInputElement>('workMinutes')
const breakSeconds = $<HTMLInputElement>('breakSeconds')
const skippable = $<HTMLInputElement>('skippable')
const strictBreaks = $<HTMLInputElement>('strictBreaks')
const overlayOpacity = $<HTMLInputElement>('overlayOpacity')
const opacityValue = $<HTMLElement>('opacityValue')
const soundEnabled = $<HTMLInputElement>('soundEnabled')
const messages = $<HTMLTextAreaElement>('messages')
const hintEnabled = $<HTMLInputElement>('hintEnabled')
const hintLeadSeconds = $<HTMLInputElement>('hintLeadSeconds')
const idlePauseMinutes = $<HTMLInputElement>('idlePauseMinutes')
const openAtLogin = $<HTMLInputElement>('openAtLogin')
const status = $<HTMLElement>('status')
const langRadios = [...document.querySelectorAll<HTMLInputElement>('input[name="language"]')]

const langParam = new URLSearchParams(location.search).get('lang')
let lang: Language = isLanguage(langParam) ? langParam : 'en'

/** Relabel the page in place — never touches form values, so unsaved edits survive. */
function applyLanguage(next: Language): void {
  lang = next
  const strings = STRINGS[lang].settings
  document.documentElement.lang = lang
  document.documentElement.dir = dirFor(lang)
  document.title = strings.windowTitle
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n as SettingsStringKey
    if (key in strings) el.textContent = strings[key]
  }
  $<HTMLElement>('langSwitch').setAttribute('aria-label', strings.language)
  for (const r of langRadios) r.checked = r.value === lang
  updateOpacityLabel()
}

function populate(s: Settings): void {
  if (s.language !== lang) applyLanguage(s.language)
  workMinutes.value = String(s.workMinutes)
  breakSeconds.value = String(s.breakSeconds)
  skippable.checked = s.skippable
  strictBreaks.checked = s.strictBreaks
  syncStrict()
  overlayOpacity.value = String(Math.round(s.overlayOpacity * 100))
  soundEnabled.checked = s.soundEnabled
  messages.value = s.messages.join('\n')
  hintEnabled.checked = s.hintEnabled
  hintLeadSeconds.value = String(s.hintLeadSeconds)
  hintLeadSeconds.disabled = !s.hintEnabled
  idlePauseMinutes.value = String(s.idlePauseMinutes)
  openAtLogin.checked = s.openAtLogin
  updateOpacityLabel()
}

/** Strict breaks imply no Esc skip: grey out the skippable toggle. */
function syncStrict(): void {
  skippable.disabled = strictBreaks.checked
  if (strictBreaks.checked) skippable.checked = false
}

function updateOpacityLabel(): void {
  opacityValue.textContent = localizeDigits(`${overlayOpacity.value}%`, lang)
}

function collect(): Partial<Settings> {
  return {
    workMinutes: Number(workMinutes.value),
    breakSeconds: Number(breakSeconds.value),
    skippable: skippable.checked,
    strictBreaks: strictBreaks.checked,
    overlayOpacity: Number(overlayOpacity.value) / 100,
    soundEnabled: soundEnabled.checked,
    messages: messages.value
      .split('\n')
      .map((m) => m.trim())
      .filter((m) => m.length > 0),
    hintEnabled: hintEnabled.checked,
    hintLeadSeconds: Number(hintLeadSeconds.value),
    idlePauseMinutes: Number(idlePauseMinutes.value),
    openAtLogin: openAtLogin.checked,
  }
}

let statusTimer: number | null = null
function flash(text: string): void {
  status.textContent = text
  if (statusTimer !== null) window.clearTimeout(statusTimer)
  statusTimer = window.setTimeout(() => {
    status.textContent = ''
  }, 2_500)
}

overlayOpacity.addEventListener('input', updateOpacityLabel)
strictBreaks.addEventListener('change', syncStrict)
hintEnabled.addEventListener('change', () => {
  hintLeadSeconds.disabled = !hintEnabled.checked
})

form.addEventListener('submit', (e) => {
  e.preventDefault()
  void window.eye.setSettings(collect()).then((applied) => {
    populate(applied)
    flash(STRINGS[lang].status.saved)
  })
})

$<HTMLButtonElement>('reset').addEventListener('click', () => {
  // Restoring defaults keeps the chosen language.
  void window.eye.setSettings({ ...DEFAULT_SETTINGS, language: lang }).then((applied) => {
    populate(applied)
    flash(STRINGS[lang].status.defaultsRestored)
  })
})

for (const radio of langRadios) {
  radio.addEventListener('change', () => {
    if (!radio.checked || !isLanguage(radio.value)) return
    // Applied and saved right away; only the language is patched, so the
    // rest of the form keeps any unsaved edits.
    applyLanguage(radio.value)
    void window.eye.setSettings({ language: radio.value })
  })
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.eye.closeSettings()
})

applyLanguage(lang)
void window.eye.getSettings().then(populate)
