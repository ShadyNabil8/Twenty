# Eye 20-20-20 — Development Guide

Cross-platform (Windows/macOS/Linux) Electron + TypeScript tray app that enforces
the 20-20-20 eye-care rule: dark overlays on **every** display, mouse confinement
during breaks, OS-level idle detection, fade-in + chime, snooze/pause from the tray.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev app with HMR (regenerates icons first) |
| `npm run dev:fast` | Dev app with seconds-scale timers (`EYE2020_FAST=1`: work 8s, hint 3s, break 4s) |
| `npm test` | Vitest unit tests (timer engine, settings, messages) |
| `npm run typecheck` | `tsc --noEmit` (build does NOT typecheck — always run this) |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run build` | electron-vite production build into `out/` |
| `npm run smoke` | Build + launch the real app and assert a full break cycle via `[e2e]` logs |
| `node scripts/probe-jail-win32.mjs` | Non-intrusive ClipCursor FFI round-trip check (Windows) |
| `npm run dist` / `npm run dist:dir` | electron-builder installers / unpacked dir into `release/` |

**IDE terminals:** unset `ELECTRON_RUN_AS_NODE` before launching the app manually,
or Electron runs as plain Node and crashes on `app.commandLine`. `scripts/smoke.mjs`
already strips it.

**Env flags:** `EYE2020_FAST=1` seconds-scale timers · `EYE2020_SMOKE=1` no real
mouse lock, silent, translucent, isolated profile, 90s auto-exit ·
`EYE2020_USERDATA=<dir>` isolated settings profile.

## Architecture (one screen)

All state and timing live in the **main process**; renderers are dumb views.

- `src/main/timer.ts` — pure tick-driven state machine (`TimerEngine`), no Electron,
  no wall clock; host executes the `TimerEvent[]` it returns. Phases:
  working → hint → break → working, + idle (auto-pause), + suspended (snooze/tomorrow).
- `src/main/index.ts` — orchestrator: 1s tick loop, 5s `powerMonitor.getSystemIdleTime()`
  poll, IPC handlers, tray actions, jail engage (on overlay fade-in) / release (break end).
- `src/main/overlays.ts` — one frameless transparent always-on-top window per display;
  handles display hotplug mid-break; fade is CSS in the renderer (`win.setOpacity`
  is unsupported on Linux).
- `src/main/native/` — mouse confinement (koffi FFI): `win32.ts` ClipCursor 1×1 +
  250ms re-assert, `darwin.ts` CGAssociateMouseAndMouseCursorPosition + warp,
  `x11.ts` XGrabPointer + warp loop, noop on Wayland (impossible by design).
- `src/main/settings.ts` — validated JSON persistence (Electron-free, unit-tested).
- `src/shared/ipc.ts` — every IPC channel name; `src/preload/index.ts` — the only
  bridge (`window.eye`), contextIsolation on, nodeIntegration off.
- `src/renderer/{overlay,hint,settings}/` — vanilla TS + CSS, one folder per window.

## Style rules

- TypeScript strict; no `any` (lint error); no default exports (except config files).
- Timer/business logic must stay in pure, Electron-free modules with unit tests.
- New IPC = add channel to `src/shared/ipc.ts` + typed method on the preload `eye` API.
  Renderers never import Electron.
- Platform-specific code lives only in `src/main/native/`, one self-contained file
  per platform behind the `MouseJail` interface, chosen by `process.platform`,
  with a logging noop fallback. Never let an FFI error escape a jail backend.
- Log lifecycle milestones as `[e2e] name key=value` lines — the smoke test and
  future debugging depend on them.
- Dependency policy: keep it minimal (koffi is the only runtime dep). No robotjs,
  no node-gyp modules, no UI frameworks. Ask before adding any dependency.

## Safety invariants (do not violate)

1. **The Esc-hold safety hatch** (3s, `ESC_HOLD_MS`) must always force-end a break,
   even with `skippable=false`. An app that locks the mouse on all screens needs
   an anti-lockout escape.
2. **Confinement must never outlive the process or the break**: every backend must
   auto-release if the process dies (ClipCursor / X grab / CG association all do),
   and `release()` is called on break end, overlay crash, quit, and tray-quit.
3. Overlay renderer crash (`render-process-gone`) → abort break + release jail.
4. Smoke/test runs must stay non-intrusive: no real jail, no sound, translucent.

## Verification

Before declaring any change done: `npm run typecheck && npm run lint && npm test
&& npm run smoke`. See `.claude/skills/verify/SKILL.md` for the full recipe and
the manual multi-monitor checklist. Do not commit unless asked.
