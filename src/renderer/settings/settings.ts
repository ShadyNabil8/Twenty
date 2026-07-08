import type { Settings } from '../../shared/types'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const form = $<HTMLFormElement>('form')
const workMinutes = $<HTMLInputElement>('workMinutes')
const breakSeconds = $<HTMLInputElement>('breakSeconds')
const skippable = $<HTMLInputElement>('skippable')
const overlayOpacity = $<HTMLInputElement>('overlayOpacity')
const opacityValue = $<HTMLElement>('opacityValue')
const soundEnabled = $<HTMLInputElement>('soundEnabled')
const messages = $<HTMLTextAreaElement>('messages')
const hintEnabled = $<HTMLInputElement>('hintEnabled')
const hintLeadSeconds = $<HTMLInputElement>('hintLeadSeconds')
const idlePauseMinutes = $<HTMLInputElement>('idlePauseMinutes')
const openAtLogin = $<HTMLInputElement>('openAtLogin')
const status = $<HTMLElement>('status')

function populate(s: Settings): void {
  workMinutes.value = String(s.workMinutes)
  breakSeconds.value = String(s.breakSeconds)
  skippable.checked = s.skippable
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

function updateOpacityLabel(): void {
  opacityValue.textContent = `${overlayOpacity.value}%`
}

function collect(): Partial<Settings> {
  return {
    workMinutes: Number(workMinutes.value),
    breakSeconds: Number(breakSeconds.value),
    skippable: skippable.checked,
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
hintEnabled.addEventListener('change', () => {
  hintLeadSeconds.disabled = !hintEnabled.checked
})

form.addEventListener('submit', (e) => {
  e.preventDefault()
  void window.eye.setSettings(collect()).then((applied) => {
    populate(applied)
    flash('Saved ✓')
  })
})

$<HTMLButtonElement>('reset').addEventListener('click', () => {
  void window.eye.setSettings(null).then((applied) => {
    populate(applied)
    flash('Defaults restored ✓')
  })
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.eye.closeSettings()
})

void window.eye.getSettings().then(populate)
