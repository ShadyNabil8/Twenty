import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron'
import type { TimerSnapshot } from '../shared/types'
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

function fmt(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

export function statusText(snap: TimerSnapshot): string {
  switch (snap.phase) {
    case 'working':
      return `Next break in ${fmt(snap.msUntilBreak ?? 0)}`
    case 'break':
      return `Break — ${fmt(snap.msUntilBreakEnd ?? 0)} left`
    case 'idle':
      return 'Paused — away from keyboard'
    case 'suspended':
      return snap.suspendReason === 'until-tomorrow'
        ? 'Paused until tomorrow'
        : `Snoozed until ${new Date(snap.suspendedUntil ?? 0).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}`
  }
}

/** Tray icon with live countdown tooltip/menu, refreshed every 15 s. */
export class TrayController {
  private tray: Tray

  constructor(
    private getSnapshot: () => TimerSnapshot,
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
    const status = statusText(snap)
    this.tray.setToolTip(`Eye 20-20-20 — ${status}`)

    const items: MenuItemConstructorOptions[] = [
      { label: status, enabled: false },
      { type: 'separator' },
      {
        label: 'Take a Break Now',
        enabled: snap.phase !== 'break',
        click: () => this.actions.breakNow(),
      },
      { label: 'Snooze for 1 Hour', click: () => this.actions.snooze() },
      { label: 'Pause Until Tomorrow', click: () => this.actions.pauseUntilTomorrow() },
    ]
    if (snap.phase === 'suspended' || snap.phase === 'idle') {
      items.push({ label: 'Resume Now', click: () => this.actions.resume() })
    }
    items.push(
      { type: 'separator' },
      { label: 'Settings…', click: () => this.actions.openSettings() },
      { type: 'separator' },
      { label: 'Quit Eye 20-20-20', click: () => this.actions.quit() },
    )
    this.tray.setContextMenu(Menu.buildFromTemplate(items))
  }
}
