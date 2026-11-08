# Step 4 — Movement compatibility: tokens, tools, groups and previews

Date: 2026-11-09
Branch: `stage/complete-predictive-navigation-and-fog-2026-11-09`
Status: **staging-only engineering work — not deployment-ready.** No production migrations, pushes to `main`, Vercel deploys or user-data writes.

## Compared movement paths against installed authority

Read the installed definitions of `public.commit_map_trajectory`, `public.move_map_group` and `forge_visibility.validate_piece_trajectory` through read-only Supabase queries. The database accepts a bounded list of 1–64 waypoint deltas, validates map visibility/control and sweeps each route leg against walls/doors/window footprints. No browser success bypasses the final database checks.

Reviewed current staged code for `TabletopApp`, `BattlemapBoard`, `AuthorizedNavigation`, `MapMovementPath`, `DragCollisionGuard`, `MapCollision`, `CampaignTools` and all pre-existing movement tests.

## Corrections staged

1. **Unify non-pointer movement.** Added `src/AuthorizedMovementPlanner.js` for keyboard and sidebar operations. It performs bounded best-first-ordered BFS over the eight server-issued direction masks, never raw wall data, and returns an exact series of 1-cell authorized legs; path length is limited to the server's 64-waypoint maximum. An adjacent key move checks a single edge without BFS. Unreachable or unauthorized destinations fail closed rather than being persisted as a straight teleport.
2. **Remove old placed-tool session bottleneck.** Repositioning an already-placed player tool via the sidebar now ensures a current server navigation grant, plans a route with the same graph as dragging, persists exactly once with `commit_map_trajectory`, validates the returned tool endpoint and refreshes projections. The old per-step `transport.getApprovedPath` flow has been retired for this entry point.
3. **Protect tool-only and mixed-group moves.** Tokens and issued tools now lock while their group commit is pending. A second relative move of any same tool or token cannot race an in-progress write. Group result validation verifies every returned token and tool against the requested endpoint. Locks and server previews release in `finally` on success, errors or rejected writes; failed optimistic token projections are re-read.
4. **Do not retain abandoned preview sight.** Cancelling a drag or dragging away and back to its starting cell immediately clears the client preview and its temporary server movement preview. Ordinary no-motion clicks do not issue redundant cleanup requests. Early rejection of a token or group route also releases server preview authorization.
5. **DM collision matches effective attributes.** Token snapshots request `npc_values` only when `isDM` is true. DM local group collision and player-preview collision supply the linked character's `field_values`; DM tool collision uses the issued tool's state attributes. This aligns conditional movement walls with the database's use of character, NPC and tool values without giving private geometry or attributes to players.
6. **Respect player map assignments.** Keyboard movement now checks `playerMapId` rather than `camp.active_map_id`, allowing separately assigned player maps under the same per-viewer authorization as pointer movement.
7. **Prevent fringe escapes.** Local navigation requires both sides of every directed edge to be included in the server-issued connected graph. `canOccupy` requires a real graph node even on fog-disabled maps.

## Verification performed

- Step 4 standalone compatibility suite: **12/12 passed** using current connector-fetched module code executed in an isolated JavaScript test harness.
- Previous Step 1–3 focused navigation/visibility suite: **21/21 passed** against the Step 4 branch state.
- Scenarios include keyboard one-step and curved paths, 64-waypoint bounds, 2×2 collision, conditional attribute thresholds, open/closed/broken doors, mixed atomic movement, no unauthorized graph-fringe step, cleanup of aborted/out-and-back previews, DM-only private attributes, tool-only commit and assigned player-map keyboard movement.
- The GitHub connector returned no PR-triggered Actions runs or combined statuses for the staging head. Therefore **CI, lint, Vite build, browser E2E, authenticated RPC and CodeQL are not confirmed**.
- This work did not apply staging migrations to the production database. The proposed November 9 SQL remains staged together with the frontend.

## Important acceptance matrix after release approval

Use existing test campaigns. Verify player keyboard on shared and privately assigned maps; token drag including curved wall sliding; 1×1, 2×2 and mount-sized units; mixed token/tool groups; tool-only groups; torches, pack mules and inventories; wall and door closed/open/broken/conditional states; DM preview without any persisted movement; repeated arrow-key presses; pickup/hold/drop; cancelled and out-and-back movement; loss of ownership, fog revocation and realtime reconnect.

Measure input-to-paint latency, remote observer p95 delay, token sprite flashes, authorized fog update rates, duplicate Supabase writes and Supabase memory use during the test. Focused source tests cannot prove all of these under actual network latency.

## Known limitations outside this step

- Repeating key presses while an earlier commit is still pending may be skipped rather than buffered; a held-key batching/replay feature should be considered after live keyboard stress testing if observed.
- The previously documented hidden/invisible wall passability tradeoff and database collision-generation SQL validation remain release gates.
- DM private character and tool attributes are hydrated only in the DM UI. The authoritative SQL remains the final arbiter if a conditional attribute changes during a gesture.
- The full consolidated branch must pass deployment schema-order review, all repository tests, security analysis and browser multiplayer acceptance before any production rollout.
