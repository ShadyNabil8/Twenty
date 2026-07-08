/** IPC channel names. Every channel used anywhere in the app is declared here. */
export const IPC = {
  /** renderer→main: primary overlay finished its fade-in. */
  overlayFaded: 'overlay:faded',
  /** renderer→main: user pressed Esc on the overlay. Payload: { forced: boolean }. */
  overlayEscape: 'overlay:escape',
  /** main→renderer: begin the fade-out animation. */
  overlayFadeOut: 'overlay:fade-out',
  /** renderer→main: user dismissed the pre-break hint toast. */
  hintDismiss: 'hint:dismiss',
  /** renderer→main (invoke): returns current Settings. */
  settingsGet: 'settings:get',
  /** renderer→main (invoke): apply a partial Settings patch (or null to reset). Returns applied Settings. */
  settingsSet: 'settings:set',
  /** renderer→main: close the settings window. */
  settingsClose: 'settings:close',
} as const
