import { createDarwinJail } from './darwin'
import { createWin32Jail } from './win32'
import { createX11Jail } from './x11'

export interface JailTarget {
  /** Cursor pin location in DIP screen coordinates (center of the primary display). */
  center: { x: number; y: number }
  /** X11 window id of the primary overlay window (Linux/X11 only). */
  x11WindowId?: number
}

export interface MouseJail {
  readonly backend: string
  engage(target: JailTarget): void
  release(): void
}

export function createNoopJail(backend: string): MouseJail {
  return {
    backend,
    engage: () => {},
    release: () => {},
  }
}

/**
 * Wrap a platform jail so that engage/release are idempotent and FFI errors
 * can never take down the app or leave the cursor locked in a broken state.
 */
function safeJail(inner: MouseJail): MouseJail {
  let engaged = false
  return {
    backend: inner.backend,
    engage(target) {
      if (engaged) return
      try {
        inner.engage(target)
        engaged = true
      } catch (err) {
        console.error(`[jail] engage failed (${inner.backend}):`, err)
        try {
          inner.release()
        } catch {
          /* best effort */
        }
      }
    },
    release() {
      if (!engaged) return
      engaged = false
      try {
        inner.release()
      } catch (err) {
        console.error(`[jail] release failed (${inner.backend}):`, err)
      }
    },
  }
}

function pickBackend(): MouseJail {
  switch (process.platform) {
    case 'win32':
      return createWin32Jail()
    case 'darwin':
      return createDarwinJail()
    case 'linux':
      if (process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland') {
        // Wayland forbids global pointer grabs by design. The overlays still
        // cover every screen; only cursor freezing degrades.
        console.warn('[jail] Wayland session detected: mouse confinement unavailable')
        return createNoopJail('noop-wayland')
      }
      return createX11Jail()
    default:
      return createNoopJail('noop-unsupported')
  }
}

/**
 * Pick the confinement backend for this platform. Every backend auto-releases
 * if the process dies (OS clears the clip / grab / window-server association),
 * so a crash can never leave the user's mouse locked.
 *
 * 'dry-run' (smoke/agent runs): constructs the real backend — proving the FFI
 * stack loads, including inside a packaged build — but engage/release never
 * touch the cursor.
 */
export function createMouseJail(opts: { mode: 'real' | 'dry-run' }): MouseJail {
  if (opts.mode === 'dry-run') {
    try {
      const real = pickBackend()
      console.log(`[jail] dry-run: ${real.backend} backend constructed`)
      return createNoopJail(`dryrun-ok:${real.backend}`)
    } catch (err) {
      console.error('[jail] dry-run: backend construction FAILED:', err)
      return createNoopJail('dryrun-failed')
    }
  }
  try {
    return safeJail(pickBackend())
  } catch (err) {
    console.error('[jail] backend unavailable, degrading to noop:', err)
    return createNoopJail('noop-unavailable')
  }
}
