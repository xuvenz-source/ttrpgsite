# World Engine V2 Phase 3 — Unified browser input (10 November 2026)

## Scope
The V2 native document capture listener is now the sole owner of accepted token drag pointerdowns; each accepted native pointerdown is marked with a WeakSet flag. The React board's marquee/pan/measurement capture listener checks that mark before claiming the same gesture. The mark contains no coordinates, IDs, or persisted state and cannot grant authorization.

The board now uses one shared input gate for active map, measurement mode, DM editor lock/unlock and player-effective DM preview for mouse and keyboard entry. Preview bypasses only the DM editor's token lock, not effective viewer identity, authorized roster, collision, or server movement rules. The obsolete duplicate V2 preview arrow handler has been removed; the one V2 KeyboardStepper owns preview and normal arrows.

DOM hit-testing validates direct sprite candidates against the authorized viewer roster and control permissions. It refuses generic buttons, token-resize/status controls, handout pins, dialogs, editor interaction SVG, and measurement widgets. An unauthorized direct sprite cannot fall back to a different token underneath it. Board marquee cannot start beneath DM environment overlays and cannot compete with token dragging.

## Release gate
Staged unit tests cover pointer claim/re-entrant React capture, unauthorized and nested control hit tests, player vs DM identity, and lock policy. Browser-level fixture tests with actual Chromium pointer capture are separately prepared. No previous client-side mock can substitute for an authenticated player/DM/preview acceptance test at several zoom levels. The goal is first-gesture selection and dragging without switching modes, with no second map action claiming that pointer, while keeping map-editor tools intact.

No deployment, SQL, RLS, Realtime subscription, or paid service.

## Completed automated browser validation
On Phase 3 staging commit `f59a662e`, the Chromium headless DOM fixture passed with actual browser-dispatched pointerdown/move/up, native pointer capture, document-capture before board capture, editor overlay hit testing, player/DM unlocked/preview first-gesture drag, editor-locked denial and nested token status controls. This is an executable DOM fixture, **not** a logged-in full React/Supabase campaign session. Release acceptance remains open pending authenticated multi-client drag at multiple zoom levels and manual editor interaction checks.
