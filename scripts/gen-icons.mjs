// Generates all app icons programmatically (no binary assets in the repo):
//   resources/tray-16|24|32.png        white line-art eye (Windows/Linux tray)
//   resources/trayTemplate[@2x].png    black line-art eye (macOS template tray icon)
//   resources/icon-256.png             filled eye app icon (window icons)
//   build/icon.png (512)               source icon for electron-builder packaging
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------- PNG encode
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ------------------------------------------------------------------- render
/** Render scene(u,v) -> [r,g,b,a] (0..1, premultiplied-none) with 3x3 supersampling. */
function render(size, scene) {
  const SS = 3
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size
          const v = (y + (sy + 0.5) / SS) / size
          const [cr, cg, cb, ca] = scene(u, v)
          r += cr * ca
          g += cg * ca
          b += cb * ca
          a += ca
        }
      }
      const n = SS * SS
      const i = (y * size + x) * 4
      const alpha = a / n
      rgba[i] = alpha > 0 ? Math.round((r / a) * 255) : 0
      rgba[i + 1] = alpha > 0 ? Math.round((g / a) * 255) : 0
      rgba[i + 2] = alpha > 0 ? Math.round((b / a) * 255) : 0
      rgba[i + 3] = Math.round(alpha * 255)
    }
  }
  return encodePng(size, rgba)
}

const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2)

// Vesica-piscis eye outline: two circles of radius R offset ±D vertically
// produce a lens with half-width W and half-height H.
const W = 0.44
const H = 0.25
const D = (W * W - H * H) / (2 * H)
const R = D + H

function inLens(u, v, shrink = 0) {
  return (
    dist(u, v, 0.5, 0.5 - D) <= R - shrink && dist(u, v, 0.5, 0.5 + D) <= R - shrink
  )
}

/** Line-art eye for tray icons (transparent background). */
function trayScene(color) {
  return (u, v) => {
    const stroke = 0.1
    const outline = inLens(u, v) && !inLens(u, v, stroke)
    const iris = Math.abs(dist(u, v, 0.5, 0.5) - 0.145) <= stroke / 2 && inLens(u, v, stroke / 2)
    const pupil = dist(u, v, 0.5, 0.5) <= 0.06
    return outline || iris || pupil ? [...color, 1] : [0, 0, 0, 0]
  }
}

/** Filled eye on a rounded square for the app icon. */
function appScene(u, v) {
  // Rounded-rect background.
  const cr = 0.18
  const dx = Math.max(Math.abs(u - 0.5) - (0.5 - cr), 0)
  const dy = Math.max(Math.abs(v - 0.5) - (0.5 - cr), 0)
  if (Math.hypot(dx, dy) > cr) return [0, 0, 0, 0]

  const layers = [
    [inLens(u, v), [0.16, 0.2, 0.24]], // lens outline
    [inLens(u, v, 0.02), [0.95, 0.96, 0.98]], // sclera
    [dist(u, v, 0.5, 0.5) <= 0.16 && inLens(u, v, 0.02), [0.17, 0.42, 0.69]], // iris rim
    [dist(u, v, 0.5, 0.5) <= 0.135 && inLens(u, v, 0.02), [0.24, 0.55, 0.83]], // iris
    [dist(u, v, 0.5, 0.5) <= 0.062, [0.06, 0.09, 0.11]], // pupil
    [dist(u, v, 0.55, 0.44) <= 0.028, [1, 1, 1]], // highlight
  ]
  let color = [0.086, 0.137, 0.18] // background slate
  for (const [hit, c] of layers) if (hit) color = c
  return [...color, 1]
}

// -------------------------------------------------------------------- write
const outputs = [
  ['resources/tray-16.png', render(16, trayScene([1, 1, 1]))],
  ['resources/tray-24.png', render(24, trayScene([1, 1, 1]))],
  ['resources/tray-32.png', render(32, trayScene([1, 1, 1]))],
  ['resources/trayTemplate.png', render(16, trayScene([0, 0, 0]))],
  ['resources/trayTemplate@2x.png', render(32, trayScene([0, 0, 0]))],
  ['resources/icon-256.png', render(256, appScene)],
  ['build/icon.png', render(512, appScene)],
]

for (const [rel, buf] of outputs) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, buf)
  console.log(`wrote ${rel} (${buf.length} bytes)`)
}
