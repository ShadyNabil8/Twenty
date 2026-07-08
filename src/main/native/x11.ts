import koffi from 'koffi'
import type { JailTarget, MouseJail } from './mouse-jail'

const GRAB_MODE_ASYNC = 1
const GRAB_SUCCESS = 0
const NONE = 0
const CURRENT_TIME = 0

/**
 * Linux/X11: grab the pointer confined to the primary overlay window and keep
 * re-centering it, which effectively freezes the cursor. The X server releases
 * the grab automatically when our client connection closes.
 */
export function createX11Jail(): MouseJail {
  const x11 = koffi.load('libX11.so.6')
  const XOpenDisplay = x11.func('XOpenDisplay', 'void *', ['string'])
  const XCloseDisplay = x11.func('XCloseDisplay', 'int', ['void *'])
  const XDefaultRootWindow = x11.func('XDefaultRootWindow', 'ulong', ['void *'])
  const XGrabPointer = x11.func('XGrabPointer', 'int', [
    'void *', // display
    'ulong', // grab_window
    'int', // owner_events
    'uint', // event_mask
    'int', // pointer_mode
    'int', // keyboard_mode
    'ulong', // confine_to
    'ulong', // cursor
    'ulong', // time
  ])
  const XUngrabPointer = x11.func('XUngrabPointer', 'int', ['void *', 'ulong'])
  const XWarpPointer = x11.func('XWarpPointer', 'int', [
    'void *', // display
    'ulong', // src_w
    'ulong', // dest_w
    'int', // src_x
    'int', // src_y
    'uint', // src_width
    'uint', // src_height
    'int', // dest_x
    'int', // dest_y
  ])
  const XFlush = x11.func('XFlush', 'int', ['void *'])

  let dpy: unknown = null
  let timer: ReturnType<typeof setInterval> | null = null

  return {
    backend: 'x11-grabpointer',
    engage(target: JailTarget) {
      dpy = XOpenDisplay(null)
      if (!dpy) throw new Error('XOpenDisplay failed')
      const root = XDefaultRootWindow(dpy)
      const confineTo = target.x11WindowId ?? root
      // event_mask 0 with owner_events False: pointer events are swallowed by
      // the grab for the duration of the break, which is exactly the intent.
      const res = XGrabPointer(
        dpy,
        root,
        0,
        0,
        GRAB_MODE_ASYNC,
        GRAB_MODE_ASYNC,
        confineTo,
        NONE,
        CURRENT_TIME,
      )
      if (res !== GRAB_SUCCESS) {
        console.warn(`[jail] XGrabPointer returned ${res} (another app may hold a grab)`)
      }
      const recenter = () => {
        XWarpPointer(dpy, NONE, root, 0, 0, 0, 0, target.center.x, target.center.y)
        XFlush(dpy)
      }
      recenter()
      timer = setInterval(recenter, 200)
    },
    release() {
      if (timer) clearInterval(timer)
      timer = null
      if (dpy) {
        XUngrabPointer(dpy, CURRENT_TIME)
        XFlush(dpy)
        XCloseDisplay(dpy)
        dpy = null
      }
    },
  }
}
