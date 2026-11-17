import { app, ipcMain, powerMonitor, screen } from 'electron'
import { SNOOZE_MS } from '../shared/defaults'
import { IPC } from '../shared/ipc'
import type { Settings } from '../shared/types'
import { HintWindow } from './hint'
import { createMessagePicker } from './messages'
import { createMouseJail, type JailTarget, type MouseJail } from './native/mouse-jail'
import { OverlayManager } from './overlays'
import { SettingsStore } from './settings'
import { SettingsWindow } from './settings-window'
import { nextLocalMidnight, TimerEngine, type TimerConfig, type TimerEvent } from './timer'
import { TrayController } from './tray'

/** TWENTY_FAST=1: seconds-scale timings for manual testing and the smoke run. */
const FAST = process.env.TWENTY_FAST === '1'
/** TWENTY_SMOKE=1: no real mouse lock, quiet + translucent overlays, auto-exit. */
const SMOKE = process.env.TWENTY_SMOKE === '1'

// The break chime must be able to play without a user gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Isolated profile for smoke/test runs so they never touch real user settings.
if (process.env.TWENTY_USERDATA) app.setPath('userData', process.env.TWENTY_USERDATA)

function toTimerConfig(s: Settings): TimerConfig {
  if (FAST) {
    return {
      workMs: 8_000,
      breakMs: 4_000,
      hintEnabled: s.hintEnabled,
      hintLeadMs: 3_000,
      idlePauseMs: 60_000,
      skippable: s.skippable,
      strict: s.strictBreaks,
    }
  }
  return {
    workMs: s.workMinutes * 60_000,
    breakMs: s.breakSeconds * 1_000,
    hintEnabled: s.hintEnabled,
    hintLeadMs: s.hintLeadSeconds * 1_000,
    idlePauseMs: s.idlePauseMinutes * 60_000,
    skippable: s.skippable,
    strict: s.strictBreaks,
  }
}

function onlyLanguageChanged(a: Settings, b: Settings): boolean {
  return (
    a.language !== b.language &&
    JSON.stringify({ ...a, language: b.language }) === JSON.stringify(b)
  )
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let store: SettingsStore
  let engine: TimerEngine
  let jail: MouseJail
  let overlays: OverlayManager
  let hint: HintWindow
  let settingsWindow: SettingsWindow
  let tray: TrayController
  let jailEngaged = false
  const pickMessage = createMessagePicker()

  const jailTarget = (): JailTarget => ({
    center: overlays.primaryCenter(),
    x11WindowId: overlays.primaryX11WindowId(),
  })

  const releaseJail = (): void => {
    jail.release()
    if (jailEngaged) {
      jailEngaged = false
      console.log('[e2e] jail-released')
    }
  }

  const dispatch = (events: TimerEvent[]): void => {
    for (const ev of events) {
      switch (ev.type) {
        case 'hint':
          hint.show(pickMessage(store.get().messages), ev.breakAt, store.get().language)
          break
        case 'hint-cancel':
          hint.close()
          break
        case 'break-start': {
          hint.close()
          const s = store.get()
          overlays.show({
            message: pickMessage(s.messages),
            // Smoke runs keep the overlay translucent and silent so a dev
            // machine isn't blacked out mid-run.
            opacity: SMOKE ? Math.min(s.overlayOpacity, 0.3) : s.overlayOpacity,
            endsAt: ev.endsAt,
            durationMs: toTimerConfig(s).breakMs,
            skippable: s.skippable,
            strict: s.strictBreaks,
            sound: s.soundEnabled && !SMOKE,
            lang: s.language,
          })
          console.log(`[e2e] break-start displays=${screen.getAllDisplays().length}`)
          break
        }
        case 'break-end':
          releaseJail()
          overlays.fadeOutAndClose()
          console.log(`[e2e] break-end reason=${ev.reason}`)
          break
        case 'phase-change':
          store.writeSuspendState(engine.suspension)
          tray.refresh()
          break
      }
    }
  }

  const applyLoginItem = (s: Settings): void => {
    // Login items only make sense for the packaged app (and are a no-op on Linux).
    if (!app.isPackaged || process.platform === 'linux') return
    app.setLoginItemSettings({ openAtLogin: s.openAtLogin })
  }

  const openSettings = (): void => settingsWindow.open(store.get().language)

  app.on('second-instance', () => openSettings())

  // Tray app: closing the last window must not quit.
  app.on('window-all-closed', () => {})

  app.on('will-quit', () => {
    try {
      jail.release()
    } catch {
      /* releasing is best-effort during shutdown */
    }
  })

  void app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock?.hide()

    store = new SettingsStore(app.getPath('userData'))
    engine = new TimerEngine(toTimerConfig(store.get()), Date.now(), store.readSuspendState())
    jail = createMouseJail({ mode: SMOKE ? 'dry-run' : 'real' })
    overlays = new OverlayManager()
    hint = new HintWindow()
    settingsWindow = new SettingsWindow()
    tray = new TrayController(
      () => engine.snapshot(Date.now()),
      () => store.get().language,
      () => toTimerConfig(store.get()).workMs,
      {
        breakNow: () => dispatch(engine.startBreakNow(Date.now())),
        snooze: () => dispatch(engine.suspend(Date.now() + SNOOZE_MS, 'snooze', Date.now())),
        pauseUntilTomorrow: () =>
          dispatch(engine.suspend(nextLocalMidnight(Date.now()), 'until-tomorrow', Date.now())),
        resume: () => dispatch(engine.resume(Date.now())),
        openSettings,
        quit: () => {
          releaseJail()
          overlays.destroyAll()
          app.quit()
        },
      },
    )

    overlays.onRendererGone = () => {
      // An overlay crashed while the mouse may be locked: abort the break.
      releaseJail()
      dispatch(engine.forceEndBreak(Date.now()))
    }
    overlays.onDisplaysChanged = () => {
      // Monitor layout changed mid-break: re-pin the cursor to the new primary.
      if (jailEngaged) {
        jail.release()
        jail.engage(jailTarget())
      }
    }

    let lastSettings = store.get()
    store.onChange((s) => {
      const prev = lastSettings
      lastSettings = s
      if (s.language !== prev.language) console.log(`[e2e] language lang=${s.language}`)
      // A language switch alone must not restart the current work period.
      if (!onlyLanguageChanged(prev, s)) {
        dispatch(engine.applyConfig(toTimerConfig(s), Date.now()))
        applyLoginItem(s)
      }
      tray.refresh()
    })

    ipcMain.on(IPC.overlayFaded, () => {
      console.log('[e2e] overlay-faded')
      if (engine.phaseKind === 'break' && !jailEngaged) {
        jail.engage(jailTarget())
        jailEngaged = true
        console.log(`[e2e] jail-engaged backend=${jail.backend}`)
      }
    })
    ipcMain.on(IPC.overlayEscape, (_event, forced: unknown) => {
      const now = Date.now()
      const events = forced === true ? engine.escapeHold(now) : engine.skip(now)
      if (events.length === 0 && engine.phaseKind === 'break' && store.get().strictBreaks) {
        console.log('[e2e] escape-ignored strict=1')
      }
      dispatch(events)
    })
    ipcMain.on(IPC.hintDismiss, () => hint.close())
    ipcMain.handle(IPC.settingsGet, () => store.get())
    ipcMain.handle(IPC.settingsSet, (_event, patch: unknown) =>
      store.set(patch === null ? null : (patch as Partial<Settings>)),
    )
    ipcMain.on(IPC.settingsClose, () => settingsWindow.close())

    setInterval(() => dispatch(engine.tick(Date.now())), 1_000)
    setInterval(
      () => dispatch(engine.reportIdle(powerMonitor.getSystemIdleTime() * 1_000, Date.now())),
      5_000,
    )

    applyLoginItem(store.get())
    tray.refresh()
    console.log(`[e2e] app-ready fast=${FAST ? 1 : 0} smoke=${SMOKE ? 1 : 0}`)

    if (SMOKE) {
      // Failsafe: never leave a stray smoke instance running.
      setTimeout(() => app.quit(), 90_000).unref()
    }
  })
}
