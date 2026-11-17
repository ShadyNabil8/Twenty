// Generates all app icons programmatically (no binary assets in the repo).
// The mark is the "lowering lid": a round eye whose lid comes down as the next
// break gets closer, and closes during the break.
//   resources/tray/lid-<k>-16|24.png          white tray frames (Windows 16, Linux 24)
//   resources/tray/lid-<k>-template[@2x].png  black macOS template frames
//     k = 0..7 lid lowering through the work period, k = 8 closed (break)
//   resources/icon-256.png                    app mark on a chart-white tile (window icons)
//   build/icon.png (512)                      source icon for electron-builder packaging
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

/** Distance from (x, y) to the segment (ax, ay)–(bx, by). */
function segDist(x, y, ax, ay, bx, by) {
  const t = Math.max(
    0,
    Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)),
  )
  return dist(x, y, ax + t * (bx - ax), ay + t * (by - ay))
}

// The eye on a 64-unit grid: outline ring r=24 (stroke 4.5), lid and pupil inside r=22.
export const TRAY_FRAMES = 9 // 0..7 lowering, 8 closed
const CLOSED = TRAY_FRAMES - 1

/** Lid edge (grid y) for frame k: from the top of the eye down to just below centre. */
const lidEdge = (k) => 10 + (k / CLOSED) * 27

/**
 * Lid-eye layer at grid point (x, y) for frame k.
 * Returns 'ring' | 'lid' | 'pupil' | 'lash' | null.
 */
function eyeLayer(x, y, k) {
  const r = dist(x, y, 32, 32)
  if (Math.abs(r - 24) <= 2.25) return 'ring'
  if (k >= CLOSED) {
    if (r <= 22 && y <= 37) return 'lid'
    if (segDist(x, y, 17, 44, 47, 44) <= 2) return 'lash'
    return null
  }
  const edge = k > 0 ? lidEdge(k) : 0
  if (r <= 22 && y <= edge) return 'lid'
  // The pupil slips under the lid with a small gap, so one-colour tray icons
  // never merge the two into a blob.
  if (dist(x, y, 32, 36) <= 7 && y >= edge + 3) return 'pupil'
  return null
}

/** One-colour tray frame (transparent background), like the OS expects. */
function trayScene(color, k) {
  return (u, v) => (eyeLayer(u * 64, v * 64, k) ? [...color, 1] : [0, 0, 0, 0])
}

const INK = [0x10 / 255, 0x10 / 255, 0x10 / 255]
const CHART = [0xf4 / 255, 0xf3 / 255, 0xef / 255]
const RED = [0xef / 255, 0x5a / 255, 0x4f / 255]

/** App icon: the static mark (lid at grid y=24) in ink with a red pupil on a chart-white tile. */
function appScene(u, v) {
  const x = u * 64
  const y = v * 64
  // Rounded tile, corner radius 12.
  const cx = Math.min(Math.max(x, 12), 52)
  const cy = Math.min(Math.max(y, 12), 52)
  if (dist(x, y, cx, cy) > 12) return [0, 0, 0, 0]
  // Mark scaled to 52/64 and centred on the tile.
  const mx = (x - 6) * (64 / 52)
  const my = (y - 6) * (64 / 52)
  const layer = eyeLayer(mx, my, 4.15) // 10 + 4.15/8·27 ≈ 24
  if (layer === 'pupil') return [...RED, 1]
  if (layer) return [...INK, 1]
  return [...CHART, 1]
}

// -------------------------------------------------------------------- write
const WHITE = [1, 1, 1]
const BLACK = [0, 0, 0]
const outputs = [
  ['resources/icon-256.png', render(256, appScene)],
  ['build/icon.png', render(512, appScene)],
]
for (let k = 0; k < TRAY_FRAMES; k++) {
  outputs.push(
    [`resources/tray/lid-${k}-16.png`, render(16, trayScene(WHITE, k))],
    [`resources/tray/lid-${k}-24.png`, render(24, trayScene(WHITE, k))],
    [`resources/tray/lid-${k}-template.png`, render(16, trayScene(BLACK, k))],
    [`resources/tray/lid-${k}-template@2x.png`, render(32, trayScene(BLACK, k))],
  )
}

for (const [rel, buf] of outputs) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, buf)
}
console.log(`wrote ${outputs.length} icons`)
