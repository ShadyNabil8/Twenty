// Non-intrusive probe of the Windows mouse-jail FFI path (koffi + user32).
// Instead of freezing the cursor, it clips to the full virtual screen shrunk
// by 1px — imperceptible — then verifies the clip took effect via
// GetClipCursor and releases it. Validates struct marshaling, __stdcall
// bindings and NULL-pointer release without disturbing the user.
//
// Usage: node scripts/probe-jail-win32.mjs
import koffi from 'koffi'

if (process.platform !== 'win32') {
  console.log('probe: win32 only, skipping')
  process.exit(0)
}

const user32 = koffi.load('user32.dll')
const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
const ClipCursor = user32.func('__stdcall', 'ClipCursor', 'bool', [koffi.pointer(RECT)])
const GetClipCursor = user32.func('__stdcall', 'GetClipCursor', 'bool', [koffi.out(koffi.pointer(RECT))])
const GetSystemMetrics = user32.func('__stdcall', 'GetSystemMetrics', 'int', ['int'])

const SM_CXVIRTUALSCREEN = 78
const SM_CYVIRTUALSCREEN = 79
console.log(
  `virtual screen (physical px): ${GetSystemMetrics(SM_CXVIRTUALSCREEN)}x${GetSystemMetrics(SM_CYVIRTUALSCREEN)}`,
)

// Derive the target from GetClipCursor's baseline (the unclipped desktop) so
// the probe works in this process's own coordinate space. A plain node.exe is
// not DPI-aware, so Windows virtualizes its coordinates on scaled displays —
// the Electron app itself is DPI-aware and converts DIPs via dipToScreenPoint.
const baseline = {}
if (!GetClipCursor(baseline)) {
  console.error('FAIL: GetClipCursor(baseline) returned false')
  process.exit(1)
}
console.log('baseline desktop rect:', JSON.stringify(baseline))

const target = {
  left: baseline.left + 1,
  top: baseline.top + 1,
  right: baseline.right - 1,
  bottom: baseline.bottom - 1,
}
if (!ClipCursor(target)) {
  console.error('FAIL: ClipCursor(rect) returned false')
  process.exit(1)
}

const readBack = {}
if (!GetClipCursor(readBack)) {
  ClipCursor(null)
  console.error('FAIL: GetClipCursor returned false')
  process.exit(1)
}
console.log('clip applied:', JSON.stringify(readBack))

const ok =
  readBack.left === target.left &&
  readBack.top === target.top &&
  readBack.right === target.right &&
  readBack.bottom === target.bottom

if (!ClipCursor(null)) {
  console.error('FAIL: ClipCursor(null) release returned false')
  process.exit(1)
}
const released = {}
GetClipCursor(released)
console.log('after release:', JSON.stringify(released))

if (!ok) {
  console.error('FAIL: read-back rect does not match the requested clip')
  process.exit(1)
}
console.log('PROBE PASS: ClipCursor round-trip works (clip + verify + release)')
