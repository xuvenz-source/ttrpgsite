# Unified movement, collision, fog and lighting — staged redesign

**Branch:** `stage/world-runtime-movement-collision-fog-2026-11-08`
**Production base:** `aa3e00f184b1f230f5d43556295c54a88f25e77e` (PR #45)
**Status:** IN PROGRESS, NOT RELEASE READY. No production merge, database change, or preview deployment.
**Design ownership:** Designer controls gameplay semantics; developer proposes and implements underlying mechanics.
**Infrastructure:** React/Vite, Supabase Free, Vercel Free. Do not introduce always-on paid infrastructure.

## Findings from historical and live-code inspection

- Before authoritative fog, dragging was a local React preview plus an ephemeral map-scoped movement broadcast and a final persisted token position.
- Fog-on currently writes intermediate coordinates every ~180ms, causing a visibility revision and receiver refresh. Fog-off sends ~50ms movement previews using the private map channel.
- Both `TabletopApp.jsx` and `BattlemapBoard.jsx` hold overlapping position/preview state. Broad React updates and 60ms coalesced visibility RPCs can compete with rendering.
- Normal real movement has no local wall preflight. DM simulation checks locally, while the active SQL trigger explicitly bypasses normal DM collision.
- Map-wide broadcast members may send a client-supplied actor claim: treat as untrusted cosmetic input, never proof of authority.
- The full background map image is served to authorized viewers. Fog rendering cannot conceal that file from a determined viewer. Preserve RLS for secret tokens and use player-safe art or future authorized tile delivery.
- Player tool glow without DM geometry is not a trustworthy depiction of wall-clipped illumination; future visuals must use authorized server-produced lighting.

## First implementation slice (now staged)

1. `TokenMotionRuntime.js` directly positions locally dragged token sprites and monitor frames using CSS translate and RAF coalescing. The normal cell-by-cell pointer path no longer updates the entire Board preview React state for each token tile. React remains the owner of persistent token rows, tool windows, selection, and other UI.
2. `FogRenderDelta.js` creates a presentation mask from the existing sanitized visibility frame and identifies changed raster cells. `MapFogOverlay.jsx` retains its canvas and updates changed cells without clearing the whole overlay each time, still failing closed when authorization is unavailable.
3. `MapMovementTrajectory.js` offers deterministic, advisory swept-footprint cell traversal. DM-only preview stops at the last legal cell on fast drags rather than ignoring the full gesture. Actual movement and player permissions stay server enforced. `MapCollision.js` map bounds now floor complete grid cells as current SQL does.
4. Added executable unit tests for motion painting, fog deltas, legal movement trajectories, and revised existing structure assertions. These tests do not establish live multiplayer smoothness or database security.

## Still required: do NOT claim these are fixed

- Replace fog-on intermediate database writes with a secure, observer-authorized movement protocol and authoritative waypoint commits.
- Decouple incoming remote previews, canonical token snapshots and fog ticks from full `TabletopApp` renders.
- Define and enforce one collision schema for token footprints, diagonals, corners, closed/open portals and elevation; remove the unconditional DM bypass via an explicit server-authorized override.
- Define atomic group movement, including mixed character/tool selections.
- Implement a trusted incremental visibility/lighting contract using published environment revisions, dynamic lights and distinct explored memory versus current LOS. Do not disclose secret wall geometry.
- Correct cosmetic light clipping and light intensity falloff across all client roles, using authorized masks rather than client-side secret geometry.
- Review direct Data API/Realtime access and the forgery issue in existing cosmetic broadcast actor claims.
- Test and profile actual DM + 2-player sessions, fog on/off, 10/50/100 tokens, multiple lights, wall ends, network loss/reconnect and 1x1/2x2/mixed footprints.
- Consolidate all other outstanding staged work into one future approved release. Do not enable automated Vercel previews.

## Dependency ordering for later staging

1. Establish browser performance baseline and deterministic collision/security fixtures.
2. Isolate local and remote motion presentation (first local slice staged).
3. Author server-authoritative movement transaction and collision geometry changes as unapplied SQL migration candidates.
4. Add authorized observer movement and lighting/visibility snapshots; maintain no-previews-for-hidden-entities security.
5. Exercise database changes only after explicit release approval using existing live test campaigns (no paid staging database).
6. Run consolidated test/build/security gates, resolve branch conflicts and deploy exactly one approved main merge.

## Acceptance criteria and measurement

- Local pointer-to-paint p95 ≤33ms, 60fps desktop target; benchmark real browser before making claims.
- No whole-map redraw or remount caused by moving a token; no black/grey flash.
- Remote positions converge without observable snapback; identify last confirmed position separately from predicted animation.
- Zero illegal server-accepted wall crossings, including large tokens, diagonals and group moves.
- Hidden NPC metadata, coordinates and artwork never reach unauthorized clients.
- Fog memory remains explored after losing sight, but current entities are hidden immediately when authorization expires.
- Solid walls block light, walls permit light around their finite ends, and door/window properties match published map rules.
- No new hourly paid infrastructure; no DB migration or Vercel deployment during ordinary staging.

## Release/rollback guidance

This first slice is frontend-only and has no schema migration. Keep the production `aa3e00f` untouched until the designer approves a consolidated release. The first slice may be reverted independently by removing the motion runtime and fog delta imports/references; it does not alter exploration persistence or map token rows. Subsequent SQL migrations require separate review, backwards-compatible data preservation and explicit live-test instructions.
