# World Engine V2 — second live-test failure after PR #66

**Status:** Staged only. No merge, Supabase migration, config change, or production deployment.

## Confirmed live failure

PR #66 deployed successfully and its Node/build, PostgreSQL authority and CodeQL checks passed. The designer's next live report: token dragging still does not work, and DM player preview cannot move. Previous pointer-capture fallbacks and selection tests were not authenticated DOM-level browser tests; green CI did not establish a working interaction.

## Audited cross-layer failure paths

**Input dispatch:** React delegates portal and editor events from the React root. A native `pointerdown` listener on the viewport (even in capture phase) can miss a pointer consumed earlier by a React synthetic capture listener. Attaching a fallback only AFTER the viewport receives pointerdown cannot repair a down event that never arrives. **Change:** one scoped document capture listener receives pointerdown ahead of React, matching move/up/cancel by pointer ID. Only events originating within the V2 map viewport can start motion, and the runtime's current authorized sight and control checks remain mandatory. It continues to hear release even if pointer capture is lost or the cursor leaves the map. No new Realtime transport or duplicate gesture handler.

**Editor stacking:** The DM environment SVG uses a higher interaction z-index than V2 sprites. When editing with Lock Tokens off, the editor still intercepts clicks/drags, because its target is explicitly excluded by secure sprite hit testing. **Change:** elevate only already-authorized DM sprite nodes above environment editing layers in explicitly unlocked editing mode. Player rendering and DM player-preview never use this elevated layer. Locked editor mode still denies movement.

**Preview identity:** The preview picker defaulted to *any* visible token, including DM-owned or unassigned actors. The V2 preview authority, correctly, refuses these because player-effective fog needs a campaign-player ID. **Change:** offer only visible tokens assigned to real non-DM campaign members, on the current map, with a clear prompt if none exists; wire both docked and floating map setting panels. Movement still uses the server's player-effective preview RPC.

**Unconfigured maps:** A DM scene with no published light/fog/collision was valid for rendering but had no compiled collision scene. PreviewAuthority requires that scene even when no walls exist, so it rejected all preview movement. **Change:** compile an empty, no-collision DM scene only when the server explicitly declares all unpublished protection rules disabled. Published-protected or malformed scenes remain fail-closed.

**Diagnostics:** Show actionable editor/preview selection reasons even when the editor intercepts the underlying sprite, without emitting private coordinates or hidden token IDs.

## Automated regression targets

- Pointerdown captured on the owner document before lower-level React handlers; scope prevents sidebar gestures; matched pointer continues outside map; capture lost, blur and unmount clean up
- Real player preview token eligibility and stale/default selection
- Published protected scene stays denied; genuinely unconfigured scene can make virtual collision-bounded steps
- Only DM unlocked editor may lift the sprite stack above environment controls
- Existing V2 preview authority, renderer sight, private observer and PostgreSQL schema tests; production Vite build and CodeQL

## Browser acceptance before any further production release

Use a real authenticated DM and player campaign, with developer console available:
1. DM outside map editor: drag an authorized token from center to several cells. A grabbed highlight should appear on pointerdown and the sprite should track the cursor while dragging, not only on release.
2. DM editing with Lock Tokens **on**: drag denied; with Lock Tokens **off**: token drag works and wall/light edit gestures still work.
3. Player: repeat on an owned token with fog/collision on. Verify hard wall stops, private fog, no flashing and no unauthorized selection.
4. DM preview: pick a token assigned to a **different campaign player**, enter preview, use arrow keys and mouse drag, and verify live DB position and exploration are unchanged after exiting.
5. No published environment: preview may move inside the map but not outside its bounds.
6. Check that tools, handouts, marquee, resizing and ctrl+wheel zoom remain functional.

This changes input routing and two confirmed UI configuration defects. It is **not** a claim of successful live movement; the remaining browser test must be done before declaring the regression closed.
