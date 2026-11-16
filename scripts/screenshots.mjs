// Regenerates the README screenshots in docs/screenshots/ from the real app
// pages. Run via `npm run screenshots` (builds first, so out/ is current).
//
// Bundles scripts/screenshots/capture.ts (it imports the app's own TrayController
// and shared modules) with esbuild — the one electron-vite already uses — then
// launches it with Electron. Overlays/hint/settings render offscreen; only the
// native tray menus flash on screen for a moment.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const electron = require('electron')
const root = process.cwd()
const tmp = mkdtempSync(join(tmpdir(), 'twenty-shots-'))
const outfile = join(tmp, 'capture.cjs')

await build({
  entryPoints: [join(root, 'scripts', 'screenshots', 'capture.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  logLevel: 'warning',
  plugins: [
    {
      // electron-vite's `?asset` imports resolve to the file's absolute path.
      name: 'asset-path',
      setup(b) {
        b.onResolve({ filter: /\?asset$/ }, (args) => ({
          path: join(args.resolveDir, args.path.replace(/\?asset$/, '')),
          namespace: 'asset-path',
        }))
        b.onLoad({ filter: /.*/, namespace: 'asset-path' }, (args) => ({
          contents: `module.exports = ${JSON.stringify(args.path)}`,
          loader: 'js',
        }))
      },
    },
  ],
})

const env = { ...process.env, TWENTY_USERDATA: join(tmp, 'profile') }
// IDE terminals export this; it would make Electron run as plain Node.
delete env.ELECTRON_RUN_AS_NODE

const result = spawnSync(electron, [outfile], { cwd: root, env, stdio: 'inherit' })
rmSync(tmp, { recursive: true, force: true })
process.exit(result.status ?? 1)
