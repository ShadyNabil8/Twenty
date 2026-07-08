import { BrowserWindow, screen } from 'electron'
import { loadPage, preloadPath } from './pages'

const WIDTH = 380
const HEIGHT = 128
const MARGIN = 16

/**
 * Small pre-break toast in the bottom-right corner of the primary display.
 * Never takes focus and never restricts the mouse — the user is still working.
 */
export class HintWindow {
  private win: BrowserWindow | null = null

  show(message: string, breakAt: number): void {
    this.close()
    const wa = screen.getPrimaryDisplay().workArea
    const win = new BrowserWindow({
      x: wa.x + wa.width - WIDTH - MARGIN,
      y: wa.y + wa.height - HEIGHT - MARGIN,
      width: WIDTH,
      height: HEIGHT,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      show: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })
    win.setAlwaysOnTop(true, 'status')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    loadPage(win, 'hint', { message, breakAt: String(breakAt) })
    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) win.showInactive()
    })
    win.on('closed', () => {
      if (this.win === win) this.win = null
    })
    this.win = win
    console.log('[e2e] hint-shown')
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }
}
