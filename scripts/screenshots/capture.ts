// Electron main entry that renders the real app pages (from the built `out/`)
// and writes README screenshots to docs/screenshots/. Bundled and launched by
// scripts/screenshots.mjs — run `npm run screenshots`, never directly.
//
// Every window except the tray menus renders offscreen, so nothing covers the
// screen and the mouse is never touched. Tray menus are native, so they pop up
// for a moment over an opaque backdrop; only that backdrop region is captured
// (Windows only — it shells out to a GDI grab).
import {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  nativeTheme,
  screen,
  Tray,
  type Menu,
  type NativeImage,
} from 'electron'
import { execFile } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS } from '../../src/shared/defaults'
import { IPC } from '../../src/shared/ipc'
import type { Language, Settings, TimerSnapshot } from '../../src/shared/types'
import { TrayController } from '../../src/main/tray'

const ROOT = process.cwd()
const OUT_DIR = join(ROOT, 'docs', 'screenshots')
const PRELOAD = join(ROOT, 'out', 'preload', 'index.js')
const BG = '#0c0d0b'
/** Stand-in "desktop" behind the translucent overlay and the hint toast. */
const WALLPAPER = 'linear-gradient(135deg, #24425e 0%, #3e3a63 55%, #6b4a5c 100%)'
const FONT = "'Segoe UI', system-ui, sans-serif"

// Keep Electron's profile (cache, prefs) out of the user's AppData.
if (process.env.TWENTY_USERDATA) app.setPath('userData', process.env.TWENTY_USERDATA)

type Page = 'overlay' | 'hint' | 'settings'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Sample user-written messages for the Arabic shots (messages are user content;
 * the app ships English defaults only).
 */
const AR_MESSAGES = [
  'بص على حاجة بعيدة عنك ٦ متر.',
  'رمّش ببطء عشر مرات عشان تريّح عينك.',
  'غمّض عينك وخد ٣ أنفاس عميقة.',
]
const messagesFor = (lang: Language): string[] =>
  lang === 'ar' ? [...AR_MESSAGES] : [...DEFAULT_SETTINGS.messages]

let settingsLang: Language = 'en'
const settingsFor = (lang: Language): Settings => ({
  ...DEFAULT_SETTINGS,
  language: lang,
  messages: messagesFor(lang),
})

function save(name: string, img: NativeImage): void {
  writeFileSync(join(OUT_DIR, `${name}.png`), img.toPNG())
  const { width, height } = img.getSize()
  console.log(`saved docs/screenshots/${name}.png (${width}x${height})`)
}

interface RenderOptions {
  width: number
  height: number
  query?: Record<string, string>
  transparent?: boolean
  css?: string
  /** Runs in the page after load, before the capture. */
  js?: string
  settleMs?: number
  /** Grow the window to the page's full scroll height before capturing. */
  fullHeight?: boolean
}

async function render(page: Page, o: RenderOptions): Promise<NativeImage> {
  const win = new BrowserWindow({
    width: o.width,
    height: o.height,
    useContentSize: true,
    enableLargerThanScreen: true,
    show: false,
    frame: false,
    transparent: o.transparent ?? false,
    backgroundColor: o.transparent ? '#00000000' : BG,
    webPreferences: {
      offscreen: true,
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  try {
    await win.loadFile(join(ROOT, 'out', 'renderer', page, 'index.html'), { query: o.query })
    if (o.css) await win.webContents.insertCSS(o.css)
    await sleep(400)
    if (o.js) await win.webContents.executeJavaScript(o.js)
    if (o.fullHeight) {
      const h = (await win.webContents.executeJavaScript(
        'document.documentElement.scrollHeight',
      )) as number
      win.setContentSize(o.width, Math.ceil(h))
    }
    await sleep(o.settleMs ?? 600)
    return await win.webContents.capturePage()
  } finally {
    win.destroy()
  }
}

/** Renders an HTML snippet (composites: monitor frames, filmstrips…). */
async function renderHtml(html: string, width: number, height: number): Promise<NativeImage> {
  const win = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    show: false,
    frame: false,
    backgroundColor: BG,
    webPreferences: { offscreen: true },
  })
  try {
    const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;overflow:hidden;background:${BG};color:#c9cbc3;font-family:${FONT}}
      .row{display:flex;gap:28px;padding:28px;align-items:flex-start;justify-content:center}
      figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:10px}
      figcaption{font-size:14px;color:#8d9088;letter-spacing:.02em}
      img{display:block}
    </style></head><body>${html}</body></html>`
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(doc)}`)
    await sleep(500)
    return await win.webContents.capturePage()
  } finally {
    win.destroy()
  }
}

const dataUrl = (img: NativeImage): string => img.toDataURL()

// ---------------------------------------------------------------- overlay ---

interface OverlayShot {
  lang?: Language
  message?: string
  secondsLeft?: number
  skippable?: boolean
  strict?: boolean
  width?: number
  height?: number
  /** Veil opacity override (fade-in frames). */
  veil?: number
  js?: string
}

function overlay(s: OverlayShot = {}): Promise<NativeImage> {
  const lang = s.lang ?? 'en'
  const durationMs = DEFAULT_SETTINGS.breakSeconds * 1000
  // Countdown keeps ticking while the page settles; pad so it lands on the target.
  const endsAt = Date.now() + (s.secondsLeft ?? 14) * 1000 + 1200
  const opacity = s.veil ?? DEFAULT_SETTINGS.overlayOpacity
  return render('overlay', {
    width: s.width ?? 1280,
    height: s.height ?? 720,
    query: {
      message: s.message ?? messagesFor(lang)[0] ?? '',
      opacity: String(opacity),
      endsAt: String(endsAt),
      duration: String(durationMs),
      skippable: s.skippable === false || s.strict ? '0' : '1',
      strict: s.strict ? '1' : '0',
      sound: '0',
      primary: '0',
      fadeIn: '0',
      fadeOut: '0',
      lang,
    },
    css: `html { background: ${WALLPAPER} !important; }`,
    js: s.js,
  })
}

// ------------------------------------------------------------------- tray ---

/** Captures a native tray menu from the real TrayController for a given state. */
async function trayMenu(snap: TimerSnapshot, lang: Language): Promise<NativeImage> {
  // Record the menu TrayController builds instead of installing it. The
  // controller (and its tray icon) stays alive until exit: it keeps a refresh
  // interval that must not hit a destroyed Tray.
  let menu: Menu | null = null
  Tray.prototype.setContextMenu = (m: Menu | null): void => {
    menu = m
  }
  new TrayController(
    () => snap,
    () => lang,
    {
      breakNow: () => {},
      snooze: () => {},
      pauseUntilTomorrow: () => {},
      resume: () => {},
      openSettings: () => {},
      quit: () => {},
    },
  )
  if (!menu) throw new Error('TrayController did not build a menu')
  const m: Menu = menu

  const display = screen.getPrimaryDisplay()
  const box = { x: display.workArea.x + 80, y: display.workArea.y + 80, width: 460, height: 420 }
  const backdrop = new BrowserWindow({
    ...box,
    frame: false,
    show: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: BG,
  })
  try {
    backdrop.show()
    await sleep(300)
    // The tray's own Menu object, popped up over the backdrop instead of at the
    // tray icon so its position is known.
    m.popup({ window: backdrop, x: 30, y: 30 })
    await sleep(700)
    // Physical-pixel rectangle of the backdrop (Electron works in DIPs).
    const tl = screen.dipToScreenPoint({ x: box.x, y: box.y })
    const br = screen.dipToScreenPoint({ x: box.x + box.width, y: box.y + box.height })
    const file = join(app.getPath('userData'), `tray-${process.pid}.png`)
    await grabScreenRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y, file)
    m.closePopup(backdrop)
    const grabbed = nativeImage.createFromPath(file)
    // Drop the backdrop window's 1px border before trimming to the menu.
    const inset = 8
    const g = grabbed.getSize()
    const crop = grabbed.crop({
      x: inset,
      y: inset,
      width: g.width - 2 * inset,
      height: g.height - 2 * inset,
    })
    rmSync(file, { force: true })
    const k = (br.x - tl.x) / box.width
    return trimToContent(crop, Math.round(14 * k))
  } finally {
    backdrop.destroy()
    await sleep(200)
  }
}

/**
 * GDI screen grab with CAPTUREBLT, which (unlike DXGI duplication) reliably
 * includes the layered windows that native popup menus are drawn in.
 */
function grabScreenRect(x: number, y: number, w: number, h: number, out: string): Promise<void> {
  const ps = `
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class Grab {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr d, int x, int y, int w, int h, IntPtr s, int sx, int sy, int rop);
  public static void Save(int x, int y, int w, int h, string path) {
    using (var bmp = new Bitmap(w, h)) {
      using (var g = Graphics.FromImage(bmp)) {
        IntPtr dst = g.GetHdc(); IntPtr src = GetDC(IntPtr.Zero);
        BitBlt(dst, 0, 0, w, h, src, x, y, 0x00CC0020 | 0x40000000); // SRCCOPY | CAPTUREBLT
        ReleaseDC(IntPtr.Zero, src); g.ReleaseHdc(dst);
      }
      bmp.Save(path, ImageFormat.Png);
    }
  }
}
'@
[Grab]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null
[Grab]::Save(${x}, ${y}, ${w}, ${h}, '${out.replace(/'/g, "''")}')
`
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      (err, _stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve()),
    )
  })
}

/** Crops away the uniform backdrop around the menu, keeping `pad` px of it. */
function trimToContent(img: NativeImage, pad: number): NativeImage {
  const { width, height } = img.getSize()
  const px = img.toBitmap() // BGRA
  const at = (x: number, y: number): number => (y * width + x) * 4
  const last = (width * height - 1) * 4 // bottom-right corner: always backdrop
  const ref = [px[last] ?? 0, px[last + 1] ?? 0, px[last + 2] ?? 0]
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = at(x, y)
      const d =
        Math.abs((px[i] ?? 0) - (ref[0] ?? 0)) +
        Math.abs((px[i + 1] ?? 0) - (ref[1] ?? 0)) +
        Math.abs((px[i + 2] ?? 0) - (ref[2] ?? 0))
      if (d > 24) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error('tray menu not found in capture')
  const x = Math.max(0, minX - pad)
  const y = Math.max(0, minY - pad)
  return img.crop({
    x,
    y,
    width: Math.min(width, maxX + pad + 1) - x,
    height: Math.min(height, maxY + pad + 1) - y,
  })
}

// ------------------------------------------------------------------- main ---

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })
  nativeTheme.themeSource = 'dark'

  ipcMain.handle(IPC.settingsGet, () => settingsFor(settingsLang))
  ipcMain.handle(IPC.settingsSet, (_e, patch: unknown) => ({
    ...settingsFor(settingsLang),
    ...(patch as Partial<Settings>),
  }))

  // 1 · 3 · 10 — the break overlay itself, in both languages.
  save('overlay', await overlay())
  save('overlay-ar', await overlay({ lang: 'ar' }))

  // 2 — the same overlay on every display, laid out like the real monitors.
  const displays = screen
    .getAllDisplays()
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
  const monitors = displays.length >= 2 ? displays : [displays[0], displays[0]]
  // Composites must fit on screen: Windows clamps windows to the display size.
  const thumbW = 700
  const frames: string[] = []
  let compH = 0
  for (const [i, d] of monitors.entries()) {
    if (!d) continue
    // Same aspect as the real display, small enough to fit an offscreen window.
    const shot = await overlay({
      width: Math.round((720 * d.bounds.width) / d.bounds.height),
      height: 720,
    })
    const h = Math.round((thumbW * d.bounds.height) / d.bounds.width)
    compH = Math.max(compH, h)
    frames.push(`<figure>
      <div style="padding:10px;background:#1d1f1b;border:1px solid #33362f;border-radius:10px">
        <img src="${dataUrl(shot)}" width="${thumbW}" height="${h}">
      </div>
      <div style="width:90px;height:22px;background:#1d1f1b;border:1px solid #33362f;border-top:0"></div>
      <figcaption>Display ${i + 1}${d.id === screen.getPrimaryDisplay().id ? ' (primary)' : ''}</figcaption>
    </figure>`)
  }
  save(
    'multi-monitor',
    await renderHtml(
      `<div class="row">${frames.join('')}</div>`,
      thumbW * 2 + 28 * 3 + 44,
      compH + 140,
    ),
  )

  // 10 — fade-in filmstrip (veil opacity steps of the 2.5 s ease-in-out).
  const steps = [0, 0.25, 0.6, DEFAULT_SETTINGS.overlayOpacity]
  const labels = ['0.0 s', '0.8 s', '1.6 s', '2.5 s']
  const film: string[] = []
  for (const [i, v] of steps.entries()) {
    const shot = await overlay({
      veil: v,
      js: `document.getElementById('veil').style.opacity='${v}'`,
    })
    film.push(
      `<figure><img src="${dataUrl(shot)}" width="340" height="191" style="border-radius:6px"><figcaption>${labels[i]}</figcaption></figure>`,
    )
  }
  save(
    'fade-in',
    await renderHtml(`<div class="row">${film.join('')}</div>`, 340 * 4 + 28 * 5, 191 + 100),
  )

  // 5 — the three ways a break can (or cannot) be ended.
  const modes: Array<[string, OverlayShot]> = [
    ['Skippable — tap Esc', { skippable: true }],
    [
      'Not skippable — hold Esc 3 s',
      {
        skippable: false,
        js: `document.getElementById('hold-progress').classList.add('active');
             document.getElementById('hold-bar').style.width='62%'`,
      },
    ],
    ['Strict — no in-app escape', { strict: true }],
  ]
  const modeFigs: string[] = []
  for (const [label, shot] of modes) {
    const img = await overlay(shot)
    modeFigs.push(
      `<figure><img src="${dataUrl(img)}" width="460" height="259" style="border-radius:6px"><figcaption>${label}</figcaption></figure>`,
    )
  }
  save(
    'break-modes',
    await renderHtml(`<div class="row">${modeFigs.join('')}</div>`, 460 * 3 + 28 * 4, 259 + 100),
  )

  // 6 — pre-break hint toast, shown in the corner of a desktop.
  const hints: string[] = []
  for (const lang of ['en', 'ar'] as const) {
    const hint = await render('hint', {
      width: 380,
      height: 128,
      transparent: true,
      query: {
        message: messagesFor(lang)[1] ?? '',
        breakAt: String(Date.now() + 28_000 + 1_200),
        lang,
      },
    })
    hints.push(`<figure>
      <div style="position:relative;width:640px;height:300px;border-radius:8px;overflow:hidden;background:${WALLPAPER}">
        <img src="${dataUrl(hint)}" width="380" height="128" style="position:absolute;right:16px;bottom:16px">
      </div>
      <figcaption>${lang === 'en' ? 'English' : 'Arabic'}</figcaption>
    </figure>`)
  }
  save(
    'hint',
    await renderHtml(`<div class="row">${hints.join('')}</div>`, 640 * 2 + 28 * 3, 300 + 100),
  )

  // 4 · 5 · 6 · 9 — settings, full length, in both languages.
  for (const lang of ['en', 'ar'] as const) {
    settingsLang = lang
    save(
      lang === 'en' ? 'settings' : 'settings-ar',
      await render('settings', { width: 560, height: 760, query: { lang }, fullHeight: true }),
    )
  }

  // 11 — the real tray menu in its different states (native, briefly on screen).
  if (process.platform !== 'win32') {
    console.log('skipping tray.png (native menu capture is Windows-only)')
    return
  }
  const now = Date.now()
  const trayStates: Array<[string, TimerSnapshot, Language]> = [
    ['Working — live countdown', { phase: 'working', msUntilBreak: 14 * 60_000 + 32_000 }, 'en'],
    ['Away from keyboard — auto-paused', { phase: 'idle' }, 'en'],
    [
      'Snoozed for an hour',
      { phase: 'suspended', suspendReason: 'snooze', suspendedUntil: now + 60 * 60_000 },
      'en',
    ],
    ['Arabic', { phase: 'working', msUntilBreak: 14 * 60_000 + 32_000 }, 'ar'],
  ]
  const trayFigs: string[] = []
  let trayW = 28
  let trayH = 0
  for (const [label, snap, lang] of trayStates) {
    const img = await trayMenu(snap, lang)
    const { width, height } = img.getSize()
    const k = 1 / screen.getPrimaryDisplay().scaleFactor
    trayW += Math.round(width * k) + 28
    trayH = Math.max(trayH, Math.round(height * k))
    trayFigs.push(
      `<figure><img src="${dataUrl(img)}" width="${Math.round(width * k)}" height="${Math.round(height * k)}"><figcaption>${label}</figcaption></figure>`,
    )
  }
  save(
    'tray',
    await renderHtml(
      `<div class="row">${trayFigs.join('')}</div>`,
      Math.max(trayW, 900),
      trayH + 100,
    ),
  )
}

// Windows come and go one at a time; closing the last must not quit.
app.on('window-all-closed', () => {})

void app.whenReady().then(async () => {
  try {
    await main()
    app.exit(0)
  } catch (err) {
    console.error(err)
    app.exit(1)
  }
})
