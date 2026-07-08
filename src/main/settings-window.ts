import { BrowserWindow, nativeImage } from 'electron'
import { loadPage, preloadPath } from './pages'
import appIcon from '../../resources/icon-256.png?asset'

export class SettingsWindow {
  private win: BrowserWindow | null = null

  open(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show()
      this.win.focus()
      return
    }
    const win = new BrowserWindow({
      width: 560,
      height: 760,
      minWidth: 480,
      minHeight: 560,
      title: 'Eye 20-20-20 — Settings',
      autoHideMenuBar: true,
      show: false,
      icon: nativeImage.createFromPath(appIcon),
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })
    loadPage(win, 'settings')
    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) win.show()
    })
    win.on('closed', () => {
      if (this.win === win) this.win = null
    })
    this.win = win
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close()
  }
}
