---
name: verify
description: Verify a change to Eye 20-20-20 end-to-end - typecheck, lint, unit tests, and the real-app smoke cycle - plus the manual multi-monitor checklist for jail/overlay changes.
---

# Verifying changes

## Automated gauntlet (run all of it, in order)

```powershell
npm run typecheck   # build does NOT typecheck; this catches type errors
npm run lint
npm test            # 32+ unit tests: timer engine, settings, messages
npm run smoke       # builds, launches the real app, asserts a full break cycle
```

The smoke test flashes translucent overlays on all displays for a few seconds
(silent, mouse untouched, isolated profile) and prints `SMOKE PASS` +
`ok N/8 …` steps. On failure it dumps the full app transcript — read it from
the top; the first missing `[e2e]` step tells you which subsystem broke:

- no `app-ready` → main process crashed at boot (check `ELECTRON_RUN_AS_NODE`)
- no `hint-shown` → timer engine or hint window
- no `break-start` / `overlays-created` → overlay manager
- no `overlay-faded` → renderer fade or IPC bridge
- no `jail-engaged backend=dryrun-ok:` → koffi/FFI backend failed to construct
  (smoke mode builds the real backend but never locks the cursor)
- no `jail-released` → mouse jail wiring
- no second `break-start` → the repeat cycle broke

On Windows also run `node scripts/probe-jail-win32.mjs` when touching
`src/main/native/` — it validates the real ClipCursor path (apply + read-back +
release) without disturbing the cursor.

## Manual checklist (human, for overlay/jail/tray changes)

Run `npm run dev:fast` from a plain terminal (not an IDE terminal) and check:

1. Overlay covers **every** display; message + countdown visible; smooth ~2.5 s
   fade-in; chime audible once.
2. Mouse is frozen during the break and restored instantly at break end.
3. Esc taps skip (when skippable); with skipping disabled in Settings, holding
   Esc 3 s force-ends the break (progress bar appears).
4. Hint toast appears bottom-right ~3 s before the break (30 s in real mode),
   mouse stays free, ✕ dismisses it.
5. Tray tooltip/menu counts down; Snooze 1 Hour and Pause Until Tomorrow work
   and survive an app restart (persisted in `state.json`).
6. Unplug/replug a monitor mid-break: overlays follow the displays.
7. Leave the machine idle past the threshold (1 min in fast mode): tray shows
   "Paused — away from keyboard"; activity restarts a fresh work period.
8. Settings save applies live and restarts the work period.

## Definition of done

All four automated commands green + the checklist items relevant to the changed
area pass. Report actual command output, not assumptions.
