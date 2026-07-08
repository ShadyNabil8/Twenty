import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { Settings } from '../shared/types'

const api = {
  /** Overlay: the fade-in transition finished (primary window only). */
  overlayFaded: (): void => ipcRenderer.send(IPC.overlayFaded),
  /** Overlay: Esc pressed. forced=true is the hold-to-force safety hatch. */
  escapeBreak: (forced: boolean): void => ipcRenderer.send(IPC.overlayEscape, forced),
  /** Overlay: main asks us to fade out before teardown. */
  onFadeOut: (cb: () => void): void => {
    ipcRenderer.on(IPC.overlayFadeOut, () => cb())
  },
  /** Hint toast: user dismissed it. */
  dismissHint: (): void => ipcRenderer.send(IPC.hintDismiss),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.settingsGet),
  setSettings: (patch: Partial<Settings> | null): Promise<Settings> =>
    ipcRenderer.invoke(IPC.settingsSet, patch),
  closeSettings: (): void => ipcRenderer.send(IPC.settingsClose),
}

contextBridge.exposeInMainWorld('eye', api)

export type EyeApi = typeof api
