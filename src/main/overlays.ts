import { BrowserWindow, screen, type Display } from 'electron'
import { FADE_IN_MS, FADE_OUT_MS } from '../shared/defaults'
import { IPC } from '../shared/ipc'
import { loadPage, preloadPath } from './pages'

export interface OverlayOptions {
  message: string
  opacity: number
  /** Epoch ms when the break ends (renderer drives its own countdown). */
  endsAt: number
  skippable: boolean
  sound: boolean
}

/**
 * Owns the full-screen break overlays: one frameless, transparent,
 * always-on-top window per connected display, kept in sync while displays are
 * plugged/unplugged mid-break. The fade is done in CSS by the renderer
 * (win.setOpacity is not supported on Linux).
 */
export class OverlayManager {
  private wins = new Map<number, BrowserWindow>()
  private opts: OverlayOptions | null = null
  private closing = false

  /** Called when displays changed during an active break (host re-pins the jail). */
  onDisplaysChanged: (() => void) | null = null
  /** Called when an overlay renderer crashes (host aborts the break). */
  onRendererGone: (() => void) | null = null

  constructor() {
    screen.on('display-added', () => this.syncDisplays())
    screen.on('display-removed', () => this.syncDisplays())
  }

  get active(): boolean {
    return this.opts !== null
  }

  show(opts: OverlayOptions): void {
    if (this.opts) return
    this.opts = opts
    this.closing = false
    for (const display of screen.getAllDisplays()) this.createFor(display, opts.sound)
    console.log(`[e2e] overlays-created count=${this.wins.size}`)
  }

  /** Ask renderers to fade out, then destroy the windows. */
  fadeOutAndClose(): void {
    if (!this.opts) return
    this.opts = null
    this.closing = true
    const wins = [...this.wins.values()]
    this.wins.clear()
    for (const win of wins) {
      if (!win.isDestroyed()) win.webContents.send(IPC.overlayFadeOut)
    }
    setTimeout(() => {
      for (const win of wins) if (!win.isDestroyed()) win.destroy()
      this.closing = false
    }, FADE_OUT_MS + 150)
  }

  /** Immediate teardown (app quit). */
  destroyAll(): void {
    this.opts = null
    for (const win of this.wins.values()) if (!win.isDestroyed()) win.destroy()
    this.wins.clear()
  }

  /** Center of the primary display in DIP coordinates (jail pin point). */
  primaryCenter(): { x: number; y: number } {
    const b = screen.getPrimaryDisplay().bounds
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }
  }

  /** X11 window id of the primary overlay, when running on Linux. */
  primaryX11WindowId(): number | undefined {
    if (process.platform !== 'linux') return undefined
    const win = this.wins.get(screen.getPrimaryDisplay().id)
    if (!win || win.isDestroyed()) return undefined
    try {
      return win.getNativeWindowHandle().readUInt32LE(0)
    } catch {
      return undefined
    }
  }

  private createFor(display: Display, sound: boolean): void {
    if (!this.opts) return
    const isPrimary = display.id === screen.getPrimaryDisplay().id
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      show: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.setMenuBarVisibility(false)

    loadPage(win, 'overlay', {
      message: this.opts.message,
      opacity: String(this.opts.opacity),
      endsAt: String(this.opts.endsAt),
      skippable: this.opts.skippable ? '1' : '0',
      sound: sound && isPrimary ? '1' : '0',
      primary: isPrimary ? '1' : '0',
      fadeIn: String(FADE_IN_MS),
      fadeOut: String(FADE_OUT_MS),
    })

    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return
      win.setBounds(display.bounds)
      if (isPrimary) {
        win.show()
        win.focus() // primary overlay owns the keyboard (Esc handling)
      } else {
        win.showInactive()
      }
    })

    // Keep keyboard focus on the primary overlay for the whole break.
    win.on('blur', () => {
      if (isPrimary && this.opts && !this.closing && !win.isDestroyed()) win.focus()
    })

    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('[overlay] renderer gone:', details.reason)
      this.onRendererGone?.()
    })

    this.wins.set(display.id, win)
  }

  private syncDisplays(): void {
    if (!this.opts || this.closing) return
    const displays = new Map(screen.getAllDisplays().map((d) => [d.id, d]))
    for (const [id, win] of this.wins) {
      if (!displays.has(id)) {
        if (!win.isDestroyed()) win.destroy()
        this.wins.delete(id)
      }
    }
    for (const [id, display] of displays) {
      // Late-added displays never replay the chime.
      if (!this.wins.has(id)) this.createFor(display, false)
    }
    console.log(`[overlay] displays changed mid-break, now covering ${this.wins.size}`)
    this.onDisplaysChanged?.()
  }
}
