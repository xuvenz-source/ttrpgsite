# World Engine V2 — Phase 3 collision solver release ledger

**Date:** 2026-11-09  
**Branch:** `stage/world-engine-v2-2026-11-09` / draft PR #58  
**Scope:** New isolated local collision code, tests and an explicitly authorized predictor bridge only. No active board integration, no live database mutations and no production deployment.

## Verified source and server semantics

Read-only comparison was performed against:
- `src/MapCollision.js`, `src/DragCollisionGuard.js`, `src/MapMovementTrajectory.js`, `src/MapEnvironment.js`, and `src/engine/v2/MovementController.js`.
- Live database `forge_visibility.wall_passes`, `forge_visibility.validate_piece_trajectory` and `forge_visibility.enforce_collision` function bodies, queried without writes.

Compatibility observations:
- Geometry in map **grid cells**; canonical token coordinates are grid integers, presentation may be fractional; token footprints can be up to 12x12 cells.
- Solid movement barriers are walls, doors and windows. Open/broken doors and windows pass; explicitly `blocksMovement:false` passes; valid numeric `movementAt` with matching piece attribute can pass. See-through vision or light permeability does **not** imply movement passability.
- `vision:'one-way'` and `oneWay` are **vision** rules in the currently deployed SQL, not one-way movement permissions. Do not add a client-only one-way movement bypass.
- Server token collision trigger checks map bounds, published scene presence, barriers, direct writes and DM override permission. V2 must preserve/replace the security contract in Phase 4; Phase 3 JS geometry is advisory.
- Server currently imposes a 120-object scene limit for enforced collision; V2 local compilation enforces the same bound to avoid silently ignoring geometry.
- The actual database also has tool movement and fog/visibility dependencies. Never remove old trigger/functions before full server parity and V2 cutover.

## Implemented files and ownership

| File | Role |
| --- | --- |
| `src/engine/v2/CollisionGeometry.js` | Deterministic convex swept-footprint geometry; strict interior segment intersection; contact without penetration allowed |
| `src/engine/v2/CollisionSolver.js` | Validated disclosed/DM scene compilation, published revision, full mixed-piece footprint checks, earliest continuous contact, wall sliding and bounds |
| `src/engine/v2/CollisionPreflight.js` | Guarded adapter for Phase 2's `canPredict`; requires independent **complete-path** authorization and matching map/revision/permission/selected piece identity |
| `src/engine/v2/index.js` | V2-only facade exports |
| `tests/world-engine-v2-phase3.test.mjs` | Solid wall, thin barrier, diagonal/corner, sliding, doors/windows, conditional barrier, footprint/group, bounds, malformed geometry and secure predictor tests |

No V2 file imports the old collision/observer/fog engine. New collision module does not perform a network call, broadcast position or commit a coordinate.

## Deterministic contract

`compileCollisionScene({map,environment,revision,collisionEnabled,scope})`:
- Requires explicitly supplied 'dm' or 'disclosed' scope, valid scene revision, map scale/size and published geometry. **The scope string is descriptive, not proof of permission**; the caller must only provide appropriately authorized geometry.
- Returns flattened barrier segments with precomputed bounds and unit tangents, map identity, map-cell bounds and revision. Invalid scene fails closed (`null`).
- Call once per static published revision, not on every pointer move. Full server geometry must not be sent to unauthorized players.

`solveCollisionPath({scene,pieces,anchor,from,to,allowSliding})`:
- Pieces retain their baseline positions; `from` and `to` are absolute coordinates of the selected group's original `anchor`.
- Each piece maintains its rigid offset and independently sweeps its entire rectangular footprint. The earliest impact of **any** member stops all members together.
- Supports continuous high-speed motion without tile sampling; limits excessive requests, missing scenes, invalid footprints and map bounds.
- A blocked diagonal may slide tangentially while staying on its known legal side, never through a wall. The API returns the final local position, waypoints and a generic blocked/complete flag, **never** blocker identities.
- Endpoint and sliding positions may be fractional. They are **presentation suggestions**, not canonical database writes or server path grants.

`collisionAllowsStep(...)` uses a non-sliding direct sweep for known legal steps. `createCollisionPredictor(...)` requires an external `authorizePath` function to return true for the **entire** fractional proposed route, and checks map ID, published revision, permission generation and selected piece identities. Missing, stale or unauthorized geometry returns false.

## Security and parity requirements before integration

1. **No confidential geometry to players:** The new JS solver is used for editor/full-geometry contexts and for server-disclosed geometry only. A player lacking exact geometry must wait at the authorized movement boundary; no hidden-wall prediction.
2. **Revalidate in PostgreSQL:** Exact server transaction/route and direct-write enforcement must check footprints and permissions. A local collision result is never accepted as a movement grant.
3. **DM preview:** Uses identical physical collision but does not issue a persisted commit. Explicit DM override belongs to server authorization, not an implicit client switch.
4. **Door and environment changes:** Publish increments scene revision, invalidates collision compilation and all stale authorized edge grants. No stale open-door passability.
5. **Future movement-only one-way gates:** If introduced by design, implement a new explicit schema field and matching PostgreSQL semantics/tests together. Current vision-only one-way must not be reinterpreted.
6. **No hidden reasons in replies:** Do not transmit blocker IDs, obstacle type, private geometry, secret NPC values, or per-barrier timings to unauthorized clients.

## Remaining work

- Complete CI, CodeQL and build checks against the final staged commit.
- Phase 4: new versioned server-side authority and parity tests on disposable PostgreSQL fixtures; harden RLS/EXECUTE/triggers; no direct table bypass.
- Phase 5: per-viewer path transport; Phase 6: published scene manager and acceleration structure; Phase 7: sight and moving lights; Phase 8: stable visual renderer.
- Integrate all token, tool, group, DM player-preview and keyboard pathways together; no double-run with old engine.
- Full multi-client live acceptance and old runtime + privileged SQL retirement only after the single integrated release gate.

**Acceptance definition for Phase 3:** Independent deterministic solver, explicit authority guard, broad regression tests and green repository verification. Live wall behaviour is unchanged until the complete engine is integrated.
