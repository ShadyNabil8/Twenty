import { ESC_HOLD_MS } from '../../shared/defaults'
import { playChime } from '../chime'

const params = new URLSearchParams(location.search)
const message = params.get('message') ?? 'Look at something 20 feet away.'
const opacity = Number(params.get('opacity') ?? '0.92')
const endsAt = Number(params.get('endsAt') ?? '0')
const skippable = params.get('skippable') === '1'
const sound = params.get('sound') === '1'
const primary = params.get('primary') === '1'
const fadeInMs = Number(params.get('fadeIn') ?? '2500')
const fadeOutMs = Number(params.get('fadeOut') ?? '800')

const veil = document.getElementById('veil') as HTMLDivElement
const countdownEl = document.getElementById('countdown') as HTMLDivElement
const escapeHintEl = document.getElementById('escape-hint') as HTMLParagraphElement
const holdProgress = document.getElementById('hold-progress') as HTMLDivElement
const holdBar = document.getElementById('hold-bar') as HTMLDivElement
;(document.getElementById('message') as HTMLHeadingElement).textContent = message

escapeHintEl.textContent = skippable
  ? 'Press Esc to skip this break'
  : 'Hold Esc for 3 seconds to end the break in an emergency'

// --- Fade in (CSS transition; portable across platforms) ------------------
let fadedIn = false
let fadingOut = false

function reportFadedIn(): void {
  if (fadedIn || fadingOut) return
  fadedIn = true
  if (primary) window.eye.overlayFaded()
}

veil.style.transitionDuration = `${fadeInMs}ms`
veil.addEventListener('transitionend', (e) => {
  if (e.propertyName === 'opacity' && !fadingOut) reportFadedIn()
})
// Fallback in case transitionend is swallowed (e.g. window shown late).
window.setTimeout(reportFadedIn, fadeInMs + 600)

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    veil.style.opacity = String(opacity)
    if (sound) playChime()
  })
})

window.eye.onFadeOut(() => {
  fadingOut = true
  veil.style.transitionDuration = `${fadeOutMs}ms`
  veil.style.opacity = '0'
})

// --- Countdown -------------------------------------------------------------
function renderCountdown(): void {
  const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
  const m = Math.floor(left / 60)
  const s = left % 60
  countdownEl.textContent = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : String(s)
}
renderCountdown()
window.setInterval(renderCountdown, 250)

// --- Esc handling: tap to skip (if allowed), hold to force-end (always) ----
let holdStart = 0
let holdTimer: number | null = null

function cancelHold(): void {
  if (holdTimer !== null) window.clearInterval(holdTimer)
  holdTimer = null
  holdProgress.classList.remove('active')
  holdBar.style.width = '0'
}

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (skippable) {
    window.eye.escapeBreak(false)
    return
  }
  if (e.repeat || holdTimer !== null) return
  holdStart = Date.now()
  holdProgress.classList.add('active')
  holdTimer = window.setInterval(() => {
    const progress = (Date.now() - holdStart) / ESC_HOLD_MS
    holdBar.style.width = `${Math.min(100, progress * 100)}%`
    if (progress >= 1) {
      cancelHold()
      window.eye.escapeBreak(true)
    }
  }, 50)
})

window.addEventListener('keyup', (e) => {
  if (e.key === 'Escape') cancelHold()
})
