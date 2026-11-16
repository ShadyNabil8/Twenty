import { dirFor, isLanguage, localizeDigits, STRINGS } from '../../shared/i18n'

const params = new URLSearchParams(location.search)
const breakAt = Number(params.get('breakAt') ?? '0')
const langParam = params.get('lang')
const lang = isLanguage(langParam) ? langParam : 'en'
const strings = STRINGS[lang]
document.documentElement.lang = lang
document.documentElement.dir = dirFor(lang)

const messageEl = document.getElementById('message') as HTMLParagraphElement
const countdownEl = document.getElementById('countdown') as HTMLSpanElement
const dismissEl = document.getElementById('dismiss') as HTMLButtonElement
messageEl.textContent = params.get('message') ?? ''
;(document.getElementById('title') as HTMLParagraphElement).textContent = strings.hint.title
dismissEl.title = strings.hint.dismiss
dismissEl.setAttribute('aria-label', strings.hint.dismiss)

function render(): void {
  const left = Math.max(0, Math.ceil((breakAt - Date.now()) / 1000))
  countdownEl.textContent = localizeDigits(`${left}${strings.secondsSuffix}`, lang)
}
render()
window.setInterval(render, 250)
dismissEl.addEventListener('click', () => {
  window.eye.dismissHint()
})
