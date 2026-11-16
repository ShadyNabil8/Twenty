---
name: release
description: Package twenty installers with electron-builder (Windows NSIS, macOS dmg, Linux AppImage/deb), including icon generation and platform caveats.
---

# Packaging releases

```powershell
npm run dist       # installers for the current OS → release/
npm run dist:dir   # unpacked app (fast; use to sanity-check packaging)
```

Configuration: `electron-builder.yml`. Icons: `scripts/gen-icons.mjs` writes
`build/icon.png` (512², electron-builder derives .ico/.icns) and the tray PNGs
in `resources/` — regenerated automatically by `prebuild`.

## Must-hold packaging rules

- `resources/**` must stay in the `files` list: tray icons are resolved at
  runtime as `out/main/../../resources/*.png` (electron-vite `?asset` imports).
- `koffi` must stay in `dependencies` (not dev), and BOTH `node_modules/koffi/**`
  and `node_modules/@koromix/**` must stay in `asarUnpack` — koffi's .node
  binary ships in the per-platform `@koromix/koffi-*` packages.
- After packaging, `node scripts/smoke.mjs "release/win-unpacked/twenty.exe"`
  must pass — step 5 (`jail-engaged backend=dryrun-ok:`) proves the FFI stack
  loads inside the packaged app.
- Cross-compiling: build each installer on its own OS (Windows→NSIS,
  macOS→dmg, Linux→AppImage/deb). Don't attempt mac builds from Windows.

## Post-build sanity

Run the unpacked build once: `release/win-unpacked/twenty.exe`
(strip `ELECTRON_RUN_AS_NODE` first in IDE terminals). Confirm the tray icon
appears and "Take a Break Now" shows overlays on all displays.

## Known platform caveats to mention in release notes

- Linux Wayland: mouse confinement is impossible by design (overlays still
  cover all screens); X11 has full confinement.
- Linux tray needs StatusNotifier/appindicator support (GNOME may need the
  AppIndicator extension).
- Exclusive-fullscreen games on Windows can occlude the overlay.
- macOS is unsigned/un-notarized until signing credentials are configured.
