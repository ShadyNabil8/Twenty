import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron'
import { formatCountdown, localizeDigits, STRINGS } from '../shared/i18n'
import type { Language, TimerSnapshot } from '../shared/types'
import trayWinIcon from '../../resources/tray-16.png?asset'
import trayLinuxIcon from '../../resources/tray-24.png?asset'
import trayMacIcon from '../../resources/trayTemplate.png?asset'

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

/** Tray icon with live countdown tooltip/menu, refreshed every 15 s. */
export class TrayController {
  private tray: Tray

  constructor(
    private getSnapshot: () => TimerSnapshot,
    private getLanguage: () => Language,
    private actions: TrayActions,
  ) {
    const iconPath =
      process.platform === 'darwin'
        ? trayMacIcon
        : process.platform === 'win32'
          ? trayWinIcon
          : trayLinuxIcon
    const icon = nativeImage.createFromPath(iconPath)
    if (process.platform === 'darwin') icon.setTemplateImage(true)
    this.tray = new Tray(icon)
    this.tray.on('double-click', () => this.actions.openSettings())
    this.refresh()
    setInterval(() => this.refresh(), 15_000)
  }

  refresh(): void {
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
