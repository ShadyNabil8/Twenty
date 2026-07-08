---
name: run
description: Launch and drive the Eye 20-20-20 Electron app for development, demos, or verifying a change works in the real app. Covers dev mode, fast timers, smoke mode, and the ELECTRON_RUN_AS_NODE pitfall.
---

# Running Eye 20-20-20

## Pick the right mode

| Goal | Command |
| --- | --- |
| Normal dev session (HMR, real 20-min timers) | `npm run dev` |
| See a full break cycle quickly (~15 s per cycle) | `npm run dev:fast` |
| Agent-driven / unattended check of a change | `npm run smoke` (build + assert full cycle, auto-exits) |
| Quick FFI sanity on Windows | `node scripts/probe-jail-win32.mjs` |

The app is tray-only: no window appears at launch. Look for the white eye icon
in the system tray. Use its menu ("Take a Break Now", "Settings…") to drive
features on demand instead of waiting for timers.

## Critical pitfalls

- **`ELECTRON_RUN_AS_NODE`**: IDE-spawned terminals (VS Code/Cursor extension
  hosts) export it, which makes Electron start as plain Node and crash with
  `Cannot read properties of undefined (reading 'commandLine')`. Fix in
  PowerShell: `Remove-Item env:ELECTRON_RUN_AS_NODE` before `npm run dev`.
  `scripts/smoke.mjs` already strips it.
- **A real (non-smoke) break freezes the mouse** on the whole machine until the
  break ends. Recovery if needed: tap Esc (skippable breaks) or hold Esc 3 s
  (always works). Never launch a real-jail run unattended — use
  `EYE2020_SMOKE=1` for agent-driven runs.
- Agent-driven manual launches: build first (`npm run build`), then
  `node scripts/smoke.mjs` is the sanctioned launcher; it isolates the settings
  profile (`EYE2020_USERDATA`) so the user's real settings are untouched.

## Reading the logs

The main process logs milestones to stdout:

```
[e2e] app-ready fast=1 smoke=1
[e2e] hint-shown
[e2e] overlays-created count=2      ← must equal the number of displays
[e2e] break-start displays=2
[e2e] overlay-faded
[e2e] jail-engaged backend=win32-clipcursor   (dryrun-ok:<backend> in smoke mode)
[e2e] jail-released
[e2e] break-end reason=completed|skipped|forced|preempted
```

Settings land in `%APPDATA%/eye-202020/settings.json` (plus `state.json` for
persisted snooze/pause) unless `EYE2020_USERDATA` overrides the location.
