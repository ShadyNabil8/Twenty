import type { BrowserWindow } from 'electron'
import { join } from 'node:path'

export const preloadPath = join(__dirname, '../preload/index.js')

/** Load a renderer page, routing to the dev server or the built files. */
export function loadPage(
  win: BrowserWindow,
  page: 'overlay' | 'hint' | 'settings',
  query: Record<string, string> = {},
): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    const qs = new URLSearchParams(query).toString()
    void win.loadURL(`${devUrl}/${page}/index.html${qs ? `?${qs}` : ''}`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${page}/index.html`), { query })
  }
}
