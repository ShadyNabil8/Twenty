const params = new URLSearchParams(location.search)
const breakAt = Number(params.get('breakAt') ?? '0')

const messageEl = document.getElementById('message') as HTMLParagraphElement
const countdownEl = document.getElementById('countdown') as HTMLSpanElement
messageEl.textContent = params.get('message') ?? ''

function render(): void {
  const left = Math.max(0, Math.ceil((breakAt - Date.now()) / 1000))
  countdownEl.textContent = `${left}s`
}
render()
window.setInterval(render, 250)
;(document.getElementById('dismiss') as HTMLButtonElement).addEventListener('click', () => {
  window.eye.dismissHint()
})
