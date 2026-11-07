# Recovered staging — authoritative fog of war and collision

**Status: foundation implemented on GitHub staging; full enforcement NOT yet implemented.**
**Branch:** `stage/authoritative-fog-collision-foundation-2026-11-07`
**Original planning branch:** `stage/dm-tools-refinement-fog-collision-2026-11-07`
**Deployment:** none. **Supabase changes:** none. **Paid infrastructure:** none.

## Recovery

The earlier branch and its design contract are intact. Its items 1–5 cover unrelated DM map refinements that already exist in the current application; item 6 explicitly documents fog/collision as missing. Do **not** cherry-pick that older branch into `main`: it diverged from released improvements. This focused branch starts from the latest production `main` and isolates the missing functionality.

## What this foundation actually stages

- `src/MapCollision.js`: bounded swept token footprint geometry in map cells. A move checks the whole path and token span, not just its destination. Doors, windows, movement-block flags, open/broken state, conditional elevation/attribute values, corners and edges are covered by deterministic tests. **Advisory/test model only** until equivalent server geometry is installed; it does not authorize movement.
- `src/MapFogModel.js`: strict parser for server-authorized fog frames, using visible/explored/unexplored states. Bad map IDs, geometry, token data, oversized masks and malformed cells are rejected. **No fog frames are issued by the server yet.**
- `staging/sql-candidates/fog_collision_visibility_foundation.sql`: additive proposal for a private feature-gate table and per-map/per-user exploration storage, with RLS and no client grants. **Not applied.** Fog and collision default off. This alone does not enforce movement or conceal tokens.
- `tests/map-fog-collision-foundation.test.mjs`: regression coverage for line crossings, diagonal long moves, larger footprints, passage through open or broken portals, map bounds, elevation conditions and redacted fog frames.

## Confirmed live schema constraints

1. `map_environments` already has separate `prepared` and `live` JSON columns and is DM-readable only. Do not make either readable by players; publishing should copy a validated prepared document into live using an explicitly authorized DM action, not leak geometry.
2. `map_tokens` player SELECT currently accepts *every* `visible=true` token on an accessible map. This leaks unrevealed NPC name, position and artwork even if an overlay covers the board. It must be replaced or guarded by server-observed visibility before fog can be called secure.
3. `map_tokens` participates in Supabase Realtime; clients can receive authorized row data there. Subscriptions must be reviewed alongside database RLS and sanitized views/RPC results.
4. Combat turn order currently publishes token details when `visible=true` without a sight check. Monitors, artwork URL issuance and reference-code operations also require visibility audit.
5. `map_environments.live` is not a reliable enforcement switch today. No server movement trigger currently enforces collision using its geometry.

## Next implementation phases (must be completed before enabling)

### A. Authoritative publishing and physical collision

- Validate geometry, finite bounds, max objects/points, portal states, blocker heights and permitted elevation field names on the server.
- Add explicit DM **Publish** and **Reset** for one map. Preserve prepared edits independently and revision the effective live state.
- Install a database trigger for player movement on `map_tokens` to check the swept footprint, including diagonal/corner, multi-cell token, doors/windows and elevation. Cover direct REST UPDATE, keyboards, single and group drags, and every RPC that edits x/y. The DM may override. Rejected writes must restore the authoritative position in UI.
- Explicitly resolve existing blocked placements and map changes. Do not turn the trigger on before its geometry and safe opt-in behavior are tested.

### B. Secure fog and exploration

- Compute current line of sight and illumination **server-side** from *published* map geometry, light sources, current user-controlled tokens, one-way rules and elevation. Recalculate on move, light/door change and DM publish. Persist explored cells for each player (or server-authorized party sharing).
- Return only bounded, sanitized per-viewer fog masks and observed token records. Default deny when map/visibility state is invalid.
- Replace broad player reads of `map_tokens`; audit Realtime, token artwork signing, monitoring/quick-status RPCs, combat roster payloads, hotbar/reference codes, handouts and all alternate data paths. A CSS mask is not authorization.
- Ensure private exploration is never sent to a different player. Re-fetch authoritative snapshot after reconnect or returning from a paused browser tab.

### C. Controlled release and acceptance

- Keep flags off until client and server are installed together and privacy review passes. Avoid any production SQL changes during staging.
- Use existing test campaigns and the free Supabase/Vercel plans only. No paid staging database, background worker or hourly resource.
- Live acceptance with DM + two players: open/close doors; light on/off; fog enabled/disabled; private and party-shared exploration; map switch/reload; hidden NPC name/image isolation via Data API and Realtime; one-way/elevation; group moves and direct REST attempts through barriers; DM override; reconnect.
- **Do not report fog or collision as working gameplay features until the server and two-client checks are completed.** Older planning text requiring a paid/disposable test database is superseded by the project live-campaign testing standard.

## Safety invariant

A movement block drawn in the browser is not authoritative. An unseen token covered by CSS is not hidden from an API user. The staging branch must never activate either feature until server authorization and data filtering exist.
