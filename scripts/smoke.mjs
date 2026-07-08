// End-to-end smoke test: launches the built app in fast+smoke mode and asserts
// the [e2e] log sequence for a full break cycle (hint → overlays → fade →
// jail engage → auto-complete → jail release → next cycle).
//
// Smoke mode keeps the run non-intrusive on a dev machine: the mouse jail is a
// no-op, the chime is silent, and overlays stay translucent. Expect the
// overlays to flash on screen for a few seconds.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Default: dev electron + this project. Optional argv[2]: path to a packaged
// binary (e.g. "release/win-unpacked/Eye 20-20-20.exe") to smoke-test a build.
const packagedBinary = process.argv[2]
const electron = packagedBinary ?? require('electron') // path to the electron binary
const args = packagedBinary ? [] : ['.']

const EXPECTED = [
  '[e2e] app-ready',
  '[e2e] hint-shown',
  '[e2e] break-start',
  '[e2e] overlay-faded',
  // dryrun-ok proves the real FFI backend constructed (koffi loaded) even
  // though smoke mode never actually locks the cursor.
  '[e2e] jail-engaged backend=dryrun-ok:',
  '[e2e] jail-released',
  '[e2e] break-end reason=completed',
  '[e2e] break-start', // second cycle: the timer repeats
]

const TIMEOUT_MS = 75_000
const userData = mkdtempSync(join(tmpdir(), 'eye2020-smoke-'))

const env = {
  ...process.env,
  EYE2020_FAST: '1',
  EYE2020_SMOKE: '1',
  EYE2020_USERDATA: userData,
}
// IDE terminals (VS Code extension hosts, etc.) export this; it would make the
// Electron binary run as plain Node and crash the app immediately.
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electron, args, {
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
})

let transcript = ''
let expectIndex = 0
let done = false

function finish(code, message) {
  if (done) return
  done = true
  console.log(message)
  if (code !== 0) {
    console.log('--- transcript ---')
    console.log(transcript || '(no output captured)')
  }
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill('SIGKILL')
    }
  } catch {
    /* already gone */
  }
  setTimeout(() => {
    try {
      rmSync(userData, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
    process.exit(code)
  }, 500)
}

function onData(data) {
  const text = data.toString()
  transcript += text
  for (const line of text.split(/\r?\n/)) {
    if (expectIndex < EXPECTED.length && line.includes(EXPECTED[expectIndex])) {
      console.log(`ok ${expectIndex + 1}/${EXPECTED.length}  ${EXPECTED[expectIndex]}`)
      expectIndex++
      if (expectIndex === EXPECTED.length) {
        finish(0, 'SMOKE PASS: full break cycle observed, timer repeats')
      }
    }
  }
}

child.stdout.on('data', onData)
child.stderr.on('data', onData)
child.on('exit', (code) => {
  if (!done) finish(1, `SMOKE FAIL: app exited early (code ${code}) at step ${expectIndex + 1}`)
})

setTimeout(() => {
  finish(1, `SMOKE FAIL: timeout waiting for step ${expectIndex + 1}: ${EXPECTED[expectIndex]}`)
}, TIMEOUT_MS)
