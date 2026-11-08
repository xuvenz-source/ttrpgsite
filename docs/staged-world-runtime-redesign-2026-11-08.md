# Unified movement, collision, fog and lighting — staged redesign

**Branch:** `stage/world-runtime-movement-collision-fog-2026-11-08`
**Production base:** `aa3e00f184b1f230f5d43556295c54a88f25e77e` (PR #45)
**Status:** RELEASE CANDIDATE — atomic backend migration `20261108031754` successfully installed on the existing Supabase project and authenticated rollback-only SQL tests passed. GitHub unit/build/CodeQL passed. Awaiting designer-authorized PR merge and single Vercel production deployment; browser multiplayer QA remains.
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

## Code-staging progress versus actual verification

The initial open issues below were addressed as **staged implementation candidates**
in the later sections: private observer movement, turn-aware atomic collision,
DM override, preview-projected fog and authorized torch light masks.
This does **not** establish that the SQL runs against the existing database,
that player/RLS confidentiality holds in practice, or that browser performance
meets the targets. These remain required acceptance gates before release.

## Development and release sequencing

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

Originally the isolated rendering slice was frontend-only. The present branch also includes seven **unapplied** SQL migration candidates. Keep production `aa3e00f` untouched until the designer approves a consolidated release. The first slice may be reverted independently by removing the motion runtime and fog delta imports/references; it does not alter exploration persistence or map token rows. Subsequent SQL migrations require separate review, backwards-compatible data preservation and explicit live-test instructions.


## Additional implementation staged (continued development)

### 1. Server-authoritative group motion and collision

- `world_runtime_collision_and_group_move.sql` stages a published-map collision trigger that applies to both player and DM tokens, including resize. DM override is no longer implicit: the DM must opt into it in map controls and the SQL RPC validates DM role.
- `world_runtime_atomic_trajectory.sql` validates every preserved bend of a token/tool drag in one RLS-invoker Postgres transaction. A rejection rolls the entire route back. This prevents a legal bend through a doorway from being evaluated as an illegal straight-line teleport.
- `world_runtime_dm_footprint_override.sql` lets a DM deliberately resize a token through walls without enabling uncontrolled privileges for players.
- `MapMovementPath.js` coalesces straight movement without losing path turns, bounded to 64 segments.

### 2. Real-time observer movement without map-wide coordinate leaks

- `world_runtime_private_observer_motion.sql` stages an authenticated movement-preview RPC and a private rate/waypoint table. Public callers can send a token or issued-tool intent, never a client-provided actor identity or recipient list. The database checks map membership, ownership, fresh sequence, published geometry and a per-piece rate cap.
- Validated positions are distributed through private `forge-observer:<map-id>:<viewer-id>` broadcast channels. Only the recipient user can subscribe. No client can send messages to those channels; the database emits them through `realtime.send`.
- The server checks both motion endpoints and interpolated intermediate positions for the recipient's visibility. A transition out of sight emits a coordinate-free `hide` rather than hidden movement.
- `TokenMotionRuntime.js` animates authorized remote samples between network ticks; local pointer motion remains immediate. Reconciliation still uses authorized table events as the source of truth.
- Canceled and completed drags clear actor-owned preview positions; expired or stale previews fail back to persisted positions. This ephemeral table is NOT an authoritative token location and is not a replacement for final collision/position commits.

### 3. Fog moving with server-validated previews

- `world_runtime_preview_visibility.sql` stages additive substitutions in the existing visibility and lighting functions. Only a fresh validated server preview belonging to the token owner, with an unchanged canonical starting position, may influence viewer rays. Existing party-sharing and RLS checks are preserved.
- The client coalesces sight refreshes to approximately four requests per second *at most while movement previews are being accepted*. Preview frame updates can discover newly RLS-authorized NPC rows even when the persistent map tick revision is unchanged.
- This is an implementation candidate, **not verified live**. Fog preview exploration, party sharing, carried light, collision rejections, map transfers and RPC concurrency require multi-account testing before publishing.
- `world_runtime_visibility_tick_metadata.sql` marks fog-enforced ticks so fog-off token movement does not blank the map, but fog-on sight invalidation still hides stale NPCs before a refreshed authorization arrives.

### 4. Authoritative lighting

- `world_runtime_authorized_light_masks.sql` computes illuminated torch cells from the published scene, clipped by wall-aware rays and the player's authorized sight. It uses validated movement previews for moving issued torches and their token carriers.
- The player light layer applies these sanitized cell masks to the existing radial light gradient. Failure returns no unoccluded player light, never raw private wall geometry.
- This candidate covers **issued-tool torches**. It does not yet establish final photometric-quality smooth shadows for *every* light type; cell-edge artifacts, static map lights, windows, elevations and non-torch light sources remain explicit browser-acceptance cases.

## Staging SQL dependency order (APPLIED IN ONE ATOMIC MIGRATION)

All seven source candidates were applied together in Supabase migration `20261108031754_world_runtime_movement_fog_collision_20261108` and mirrored into `supabase/migrations/20261108031754_world_runtime_movement_fog_collision_20261108.sql` for reproducibility:

1. `staging/sql-candidates/world_runtime_collision_and_group_move.sql`
2. `staging/sql-candidates/world_runtime_dm_footprint_override.sql`
3. `staging/sql-candidates/world_runtime_atomic_trajectory.sql`
4. `staging/sql-candidates/world_runtime_private_observer_motion.sql`
5. `staging/sql-candidates/world_runtime_preview_visibility.sql`
6. `staging/sql-candidates/world_runtime_authorized_light_masks.sql`
7. `staging/sql-candidates/world_runtime_visibility_tick_metadata.sql`

These candidates have already been consolidated, compiled and committed as one atomic migration. Schema/function/trigger installation and RPC role grants were verified, along with authenticated SQL smoke tests inside rolled-back transactions. Browser multi-client testing and visual performance profiling are still required after the coordinated frontend release.

## Release blockers and required acceptance

- Run the GitHub unit-test, lint, build and security workflows on the **latest consolidated commit**, not simply an earlier feature commit. Green static tests do not prove SQL compiles or multiplayer works.
- Perform a deliberate privilege review: anonymous API denied, unowned map token and tool denied, forged observer topic SEND denied, viewer topic SELECT restricted, DM override denied to players, drag canceled/rejected/reconnected without lingering sight.
- Exercise a DM + two real players against *existing live test campaigns after designer release approval*, both fog on/off and shared/private LOS. Test 1x1 and larger footprints, diagonals, wall ends, doors, windows, moving torches, dynamic lighting, grouped tokens/tools, and rollbacks.
- Profile 10/50/100 token boards, rapid drags, network loss/rejoin and map changes. Do not claim latency or 60fps targets from static checks.
- Check known limitations: the current map background artwork remains inspectable by the recipient browser; visual fog does not cryptographically hide unrevealed background art. Full terrain confidentiality needs protected tiles or player-safe map images.
- **Implementation is in PR #46.** Merge once the release commit passes GitHub checks; this invokes one Vercel production build. No other outstanding release-ready staged components remain.
