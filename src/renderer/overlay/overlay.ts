import { DEFAULT_MESSAGES, ESC_HOLD_MS } from '../../shared/defaults'
import { dirFor, formatCountdown, isLanguage, STRINGS } from '../../shared/i18n'
import { playChime } from '../chime'

const params = new URLSearchParams(location.search)
const langParam = params.get('lang')
const lang = isLanguage(langParam) ? langParam : 'en'
const t = STRINGS[lang].overlay
document.documentElement.lang = lang
document.documentElement.dir = dirFor(lang)

const message = params.get('message') ?? DEFAULT_MESSAGES[0] ?? ''
const opacity = Number(params.get('opacity') ?? '0.92')
const endsAt = Number(params.get('endsAt') ?? '0')
const durationMs = Number(params.get('duration') ?? '0')
const strict = params.get('strict') === '1'
const skippable = !strict && params.get('skippable') === '1'
const sound = params.get('sound') === '1'
const primary = params.get('primary') === '1'
const fadeInMs = Number(params.get('fadeIn') ?? '2500')
const fadeOutMs = Number(params.get('fadeOut') ?? '800')

const veil = document.getElementById('veil') as HTMLDivElement
const countdownEl = document.getElementById('countdown') as HTMLDivElement
const escapeHintEl = document.getElementById('escape-hint') as HTMLParagraphElement
const holdProgress = document.getElementById('hold-progress') as HTMLDivElement
const holdBar = document.getElementById('hold-bar') as HTMLDivElement
const edgeBar = document.getElementById('edge-bar') as HTMLDivElement
;(document.getElementById('message') as HTMLHeadingElement).textContent = message
;(document.getElementById('kicker') as HTMLParagraphElement).textContent = t.kicker

/** Set text, drawing every "Esc" as a key cap (built from DOM nodes, never HTML). */
function setWithKeyCaps(el: HTMLElement, text: string): void {
  el.replaceChildren()
  text.split(/(Esc)/).forEach((part) => {
    if (part === 'Esc') {
      const kbd = document.createElement('kbd')
      kbd.textContent = part
      el.append(kbd)
    } else if (part) {
      el.append(part)
    }
  })
}

setWithKeyCaps(
  escapeHintEl,
  strict ? t.strict : skippable ? t.skippable : t.holdEsc(Math.round(ESC_HOLD_MS / 1000)),
)

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

// --- Countdown + edge progress bar ----------------------------------------
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function remainingFraction(): number {
  if (!(durationMs > 0)) return 0
  return Math.min(1, Math.max(0, (endsAt - Date.now()) / durationMs))
}

function renderCountdown(): void {
  const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
  countdownEl.textContent = formatCountdown(left, lang, false)
  if (reduceMotion) edgeBar.style.transform = `scaleX(${remainingFraction()})`
}
renderCountdown()
window.setInterval(renderCountdown, 250)

// One linear transition from "now" to empty keeps every display in sync,
// including overlays created mid-break by a display hotplug.
edgeBar.style.transform = `scaleX(${remainingFraction()})`
if (!reduceMotion) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      edgeBar.style.transitionDuration = `${Math.max(0, endsAt - Date.now())}ms`
      edgeBar.style.transform = 'scaleX(0)'
    })
  })
}

// --- Esc handling: tap to skip (if allowed), hold to force-end -------------
// Strict breaks register no Esc handling at all (main also ignores the IPC).
let holdStart = 0
let holdTimer: number | null = null

function cancelHold(): void {
  if (holdTimer !== null) window.clearInterval(holdTimer)
  holdTimer = null
  holdProgress.classList.remove('active')
  holdBar.style.width = '0'
}

if (!strict) {
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
}
