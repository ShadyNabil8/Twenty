import koffi from 'koffi'
import { screen } from 'electron'
import type { JailTarget, MouseJail } from './mouse-jail'

/**
 * Windows: pin the cursor with ClipCursor to a 1×1 rect. Focus changes and
 * Win-key combos silently clear the clip, so it is re-asserted on a short
 * interval. The OS clears the clip automatically if the process dies.
 */
export function createWin32Jail(): MouseJail {
  const user32 = koffi.load('user32.dll')
  const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
  const ClipCursor = user32.func('__stdcall', 'ClipCursor', 'bool', [koffi.pointer(RECT)])
  const SetCursorPos = user32.func('__stdcall', 'SetCursorPos', 'bool', ['int', 'int'])

  let timer: ReturnType<typeof setInterval> | null = null

  return {
    backend: 'win32-clipcursor',
    engage(target: JailTarget) {
      // ClipCursor works in physical pixels; Electron coordinates are DIPs.
      const px = screen.dipToScreenPoint(target.center)
      const pin = () => {
        SetCursorPos(px.x, px.y)
        ClipCursor({ left: px.x, top: px.y, right: px.x + 1, bottom: px.y + 1 })
      }
      pin()
      timer = setInterval(pin, 250)
    },
    release() {
      if (timer) clearInterval(timer)
      timer = null
      ClipCursor(null)
    },
  }
}
