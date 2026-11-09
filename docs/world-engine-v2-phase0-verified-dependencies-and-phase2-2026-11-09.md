# World Engine V2 — Phase 0 verification checkpoint and Phase 2 build ledger

**Date:** 2026-11-09  
**Main baseline examined:** `ab0901f7cbe85f2bf62bccf7c0941c3eec928d04`  
**Staging branch:** `stage/world-engine-v2-2026-11-09`  
**Safety:** READ-ONLY queries against production Supabase. No SQL schema changes, production source changes or deployments during this checkpoint.

## Verified from GitHub code

- `src/BattlemapBoard.jsx` actively imports `MapCollision.js`, `MapMovementTrajectory.js`, `DragCollisionGuard.js`, `ConcealedMovementGate.js`, `ConcealedGestureBatch.js`, `TokenMotionRuntime.js`, `AuthorizedFractionalMotion.js` and `MapFogOverlay.jsx`. Board gesture state also owns player navigation invalidation, DM preview motion, token selection and sprite reconciliation.
- `src/TabletopApp.jsx` imports `LiveTokenMovement.js`, `ObserverPreviewQueue.js`, `BufferedObserverPathQueue.js`, `AuthorizedMotionTransport.js`, `AuthorizedNavigation.js`, `AuthorizedMovementPlanner.js`, `RemotePositionSettler.js`, `ObserverMovement.js`, `useAuthorizedMapFog.js`, `useAuthorizedMapLights.js` and `AuthorizedObserverVisibility.js`.
- `useAuthorizedMapFog.js` attempts `get_authorized_map_fog_delta` then `get_authorized_map_fog_v2` then `get_authorized_map_fog` only when newer endpoints are genuinely missing. This remains an actual compatibility pathway to retire at cutover.
- `src/MapEnvironment.js` defines environment semantics, walls/doors/windows/lights, conditional movement and vision, and grid-cell coordinates. Its contracts must be mapped into V2; importing it into the new engine is prohibited until its semantics are re-implemented and tested.
- `src/AuthorizedNavigation.js` holds server-issued bounded disclosed movement grants; `src/ConcealedMovementGate.js` and `src/ConcealedGestureBatch.js` manage separate actor gesture path batching. V2 should not directly reuse these implementations.
- `src/TokenMotionRuntime.js` independently orchestrates local/remote presentation and reconciliation. V2 needs one scoped renderer and a single presentation position per piece.
- GitHub PR #57 was merged; **the prior document's “staged only” status is historical and is no longer accurate** for the 9 Nov 2026 database changes.

These observations identify *call graph candidates*. They do not prove multiple controllers were advancing one piece concurrently. A complete import/call graph and browser trace remain prerequisites to legacy deletion, not to isolated Phase 2 development.

## Verified from live Supabase, read-only

Project `TTRPG Site` in `ap-northeast-1`, PostgreSQL 17.11, status healthy at query time. This differs from earlier isolated PostgreSQL 16 SQL fixture descriptions.

Applied migrations include:
- `20261109082328` — unified movement batched concealed navigation
- `20261109082332` — unified movement batched motion observer visibility
- `20261109082344` — unified movement authorized DM observer paths
- `20261109082347` — unified movement DM held torch authorized motion

Public legacy/current movement RPCs visible to `authenticated` include:
- `begin_authorized_navigation_gesture`, `advance_authorized_navigation_gesture`, `advance_authorized_navigation_gesture_batch`, `end_authorized_navigation_gesture`
- `begin_map_motion_session`, `advance_map_motion_session`, `advance_map_motion_session_path`, `end_map_motion_sessions`, `end_map_motion_previews`
- `preview_map_motion`, `commit_map_trajectory`, `move_map_group`, `get_authorized_map_navigation`
- `get_authorized_map_fog`, `get_authorized_map_fog_v2`, `get_authorized_map_fog_delta` and viewer light masks v1/v2.

Their availability is historical, not a licence to call them from V2. V2 uses a new versioned protocol after Phase 4.

Protected tables observed with RLS enabled include `public.map_environments`, `public.map_tokens`, `public.campaign_tool_map_tokens`, `public.map_viewer_visibility_ticks`, `forge_visibility.exploration`, `forge_visibility.map_rules`, `forge_visibility.navigation_gestures` and `forge_visibility.navigation_gesture_budgets`.

Notable trigger dependencies: `public.map_tokens` has `forge_visibility.enforce_collision`, `forge_visibility.tick_tokens`, `forge_visibility.tick_navigation_token_permissions`, combat sync, protected columns, validation and status hooks. `public.campaign_tool_map_tokens` has `forge_visibility.tick_tools`. These cannot be dropped solely because they have movement-related names. Existing privileges for some internal trigger helper functions and `forge_visibility.point_visible` include `anon` EXECUTE: audit exact definitions and reachability in Phase 4/10 before changing grants. Presence of a grant alone is not proof of an exploitable vulnerability.

No SQL writes were performed.

## Critical preservation dependencies

1. Canonical token/tool data, map IDs, existing scene revisions, exploration history and legitimate ownership permissions.
2. Solid wall movement/door/window semantics for both DM and players.
3. Tool tokens, carried light, mounts, multiple selections and DM player preview.
4. Per-viewer private NPC and visibility handling; no player-authored authority/hidden scene broadcasts.
5. Combat/initiative, token statuses, monitors, inventory, sheet/edit autosave, measurements, handouts and hotbar.

All unrelated open draft PRs are separate change streams. Do not blindly merge PRs #20/#21/#32/#33 into this branch.

## Phase 2 implementation (isolated, not wired to live board)

New modules:
- `src/engine/v2/GesturePath.js`: bounded ordered pointer bend compression, budgeted trajectory batches, 8-connected ACK-prefix expansion.
- `src/engine/v2/MovementController.js`: explicit grab/move/finishing/terminal lifecycle; single actor gesture, bounded serialized authority requests, synchronous pickup and optional **explicitly permitted** fractional prediction; rejection of invalid/out-of-order/private ACK packets; release drains queued path; safe cancellation and map/revision invalidation.
- `src/engine/v2/InputController.js`: normalized pointer/mouse/touch, coalesced samples, keyboard nudges, pointer capture, escape/blur/pointercancel/unmount cleanup.
- `src/engine/v2/index.js`: V2-only public exports, no existing movement imports.
- `tests/world-engine-v2-phase2.test.mjs`: automated simulated authority and DOM event tests. No live map or database connections.

**Contract warning:** `authority.begin/advance/commit/cancel` is an injected testable interface; no production V2 SQL or transport exists yet. The new controller is intentionally **not connected** to `BattlemapBoard.jsx` / `TabletopApp.jsx` so there is no double engine. The real integration must wait for movement authority, collision and renderer work packages. The default local `canPredict` predicate is false; no hidden geometry movement is predicted without a trusted grant.

## Verification gates and remaining work

- [x] Confirm current GitHub baseline and prior merged release.
- [x] Verify latest four SQL migrations are already applied.
- [x] Inspect current movement/fog entrypoint imports and scene format.
- [x] Inspect live relevant RPC names/role grants and trigger dependencies, read-only.
- [x] Create isolated V2 Phase 2 modules and focused tests.
- [ ] Confirm automated tests and Vite build on final staging SHA.
- [ ] Complete full-code call-graph inventory and test actual browser/network profiles. This requires more than module imports and is mandatory before Phase 10 deletion.
- [ ] Verify all production SQL function **bodies**, dependent triggers and security grants with disposable-role fixture tests before Phase 4.
- [ ] Implement server authority, scene collision, visual renderer and fog transport in later phases.
- [ ] Integrate and acceptance-test all listed features, then retire old runtime/SQL in one reviewed cutover.
- [ ] Single integrated release; no production changes until designer authorizes deployment.

**Phase 2 is source-staged only.** Passing unit tests alone will not prove live responsiveness or secure hidden-collision performance.
