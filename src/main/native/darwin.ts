import koffi from 'koffi'
import type { JailTarget, MouseJail } from './mouse-jail'

/**
 * macOS: freeze the cursor by dissociating mouse movement from the cursor
 * position (CGAssociateMouseAndMouseCursorPosition), after warping it to the
 * overlay center. The association is tied to our window-server connection, so
 * it resets if the process dies. A slow re-warp loop is kept as belt and
 * braces in case something re-associates the cursor mid-break.
 */
export function createDarwinJail(): MouseJail {
  const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
  const CGPoint = koffi.struct('CGPoint', { x: 'double', y: 'double' })
  // boolean_t is a 4-byte unsigned int, not a 1-byte C bool.
  const associate = cg.func('CGAssociateMouseAndMouseCursorPosition', 'int32', ['uint32'])
  const warp = cg.func('CGWarpMouseCursorPosition', 'int32', [CGPoint])

  let timer: ReturnType<typeof setInterval> | null = null

  return {
    backend: 'darwin-cganchor',
    engage(target: JailTarget) {
      const point = { x: target.center.x, y: target.center.y }
      warp(point)
      associate(0)
      timer = setInterval(() => warp(point), 500)
    },
    release() {
      if (timer) clearInterval(timer)
      timer = null
      associate(1)
    },
  }
}
