import {
  Menu,
  Tray,
  nativeImage,
  type MenuItemConstructorOptions,
  type NativeImage,
} from 'electron'
import { dirname, join } from 'node:path'
import { formatCountdown, localizeDigits, STRINGS } from '../shared/i18n'
import type { Language, TimerSnapshot } from '../shared/types'
import { TRAY_FRAMES, trayFrame } from './tray-frame'
// One import locates the generated frame folder (resources/ is shipped as-is);
// the other frames sit next to it.
import firstFrame from '../../resources/tray/lid-0-16.png?asset'

export interface TrayActions {
  breakNow(): void
  snooze(): void
  pauseUntilTomorrow(): void
  resume(): void
  openSettings(): void
  quit(): void
}

function fmt(ms: number, lang: Language): string {
  return formatCountdown(Math.round(ms / 1000), lang, true)
}

export function statusText(snap: TimerSnapshot, lang: Language): string {
  const t = STRINGS[lang].tray
  switch (snap.phase) {
    case 'working':
      return t.nextBreakIn(fmt(snap.msUntilBreak ?? 0, lang))
    case 'break':
      return t.breakLeft(fmt(snap.msUntilBreakEnd ?? 0, lang))
    case 'idle':
      return t.idle
    case 'suspended': {
      if (snap.suspendReason === 'until-tomorrow') return t.untilTomorrow
      const time = new Date(snap.suspendedUntil ?? 0).toLocaleTimeString(
        lang === 'ar' ? 'ar-EG' : [],
        { hour: '2-digit', minute: '2-digit' },
      )
      return t.snoozedUntil(localizeDigits(time, lang))
    }
  }
}

/** Load every lid frame for this platform (macOS: template images with @2x). */
function loadFrames(): NativeImage[] {
  const dir = dirname(firstFrame)
  const suffix =
    process.platform === 'darwin' ? 'template' : process.platform === 'win32' ? '16' : '24'
  return Array.from({ length: TRAY_FRAMES }, (_, k) => {
    const img = nativeImage.createFromPath(join(dir, `lid-${k}-${suffix}.png`))
    if (process.platform === 'darwin') img.setTemplateImage(true)
    return img
  })
}

/**
 * Tray icon with live countdown tooltip/menu, refreshed every 15 s. The icon is
 * the lowering-lid eye: its lid tracks the work period (checked every second,
 * swapped only when the frame changes) and closes during a break.
 */
export class TrayController {
  private tray: Tray
  private frames = loadFrames()
  private frame = -1

  constructor(
    private getSnapshot: () => TimerSnapshot,
    private getLanguage: () => Language,
    private getWorkMs: () => number,
    private actions: TrayActions,
  ) {
    this.tray = new Tray(this.frames[0] ?? nativeImage.createEmpty())
    this.tray.on('double-click', () => this.actions.openSettings())
    this.refresh()
    setInterval(() => this.refresh(), 15_000)
    setInterval(() => this.updateIcon(), 1_000)
  }

  private updateIcon(): void {
    const frame = trayFrame(this.getSnapshot(), this.getWorkMs())
    if (frame === this.frame) return
    const img = this.frames[frame]
    if (!img) return
    this.frame = frame
    this.tray.setImage(img)
  }

  refresh(): void {
    this.updateIcon()
    const snap = this.getSnapshot()
    const lang = this.getLanguage()
    const t = STRINGS[lang].tray
    const status = statusText(snap, lang)
    this.tray.setToolTip(`twenty — ${status}`)

    const items: MenuItemConstructorOptions[] = [
      { label: status, enabled: false },
      { type: 'separator' },
      {
        label: t.breakNow,
        enabled: snap.phase !== 'break',
        click: () => this.actions.breakNow(),
      },
      { label: t.snooze, click: () => this.actions.snooze() },
      { label: t.pauseUntilTomorrow, click: () => this.actions.pauseUntilTomorrow() },
    ]
    if (snap.phase === 'suspended' || snap.phase === 'idle') {
      items.push({ label: t.resume, click: () => this.actions.resume() })
    }
    items.push(
      { type: 'separator' },
      { label: t.settings, click: () => this.actions.openSettings() },
      { type: 'separator' },
      { label: t.quit, click: () => this.actions.quit() },
    )
    this.tray.setContextMenu(Menu.buildFromTemplate(items))
  }
}
