# Step 5 — Full integration and release validation gate

Date: 2026-11-09
Branch: `stage/complete-predictive-navigation-and-fog-2026-11-09`
Production status: **UNCHANGED**. This is a staging-only engineering gate. Do not merge, deploy, or apply the SQL without the designer's explicit release authorization.

## Integration inventory

The consolidated branch contains Steps 1–5, including `AuthorizedNavigation`, `AuthorizedViewerTick`, `AuthorizedFogDelta`, `AuthorizedMovementPlanner`, `DragCollisionGuard`, updated `BattlemapBoard`, `TabletopApp`, `useAuthorizedMapFog`, the three November 9 SQL migrations, and all corresponding regression tests. All changes remain ahead of the same `main` production commit; there is no branch divergence at the last comparison.

Required migration order in one release:
1. `20261109000100_authorized_predictive_navigation.sql`: private permission generations, revocation triggers, authoritative navigation RPC, collision/visibility checks
2. `20261109000200_private_verified_visibility_deltas.sql`: sanitized `authorized_frame` column, private fog-frame generator, per-viewer notification writer
3. `20261109000300_navigation_scene_revisions.sql`: versioned authorized fog RPC and delta RPC, consistent scene and permission generations

Never deploy only the frontend or only part of this sequence. No migration is applied to production.

## Verified database compatibility (read-only production queries only)

- The existing database has the required core functions `forge_visibility.bump_tick`, `bump_viewer_ticks`, `fog_cells_diff`, `tick_tokens`, `tick_character_elevation`, `wall_passes`, `ray_blocked`, `is_lit`, `swept_hits_segment`, `public.get_authorized_map_fog`, `get_authorized_map_fog_v2`, `get_authorized_map_fog_delta`, `move_map_group` and `commit_map_trajectory`.
- Existing `map_viewer_visibility_ticks` is in `supabase_realtime` and its RLS SELECT policy restricts it to the currently authorized user and assigned map. Private `forge_visibility.viewer_fog_snapshots` and `exploration` tables exist.
- **Release-blocking SQL bug found and corrected:** `pg_catalog.greatest()` and `pg_catalog.least()` are invalid schema-qualified PostgreSQL special expressions. All twelve instances in the proposed navigation migration were changed to valid `GREATEST()` and `LEAST()`. The supported expression and advisory-lock functions were separately checked by read-only SQL.
- **Authorization race corrected:** The navigation generator now checks the canonical character ownership for player-linked characters, compares its scene, collision and permission versions to the trusted server fog frame, and revalidates map-scene/permission generations before issuing a graph.
- **Revocation coverage corrected:** Generation triggers handle controlled tokens and shared tools on INSERT, UPDATE and DELETE. The existing token visibility-tick publisher runs after the new token permission-generation trigger; tool changes explicitly produce viewer notification.
- The new `authorized_frame` column, new generation table and new graph RPC are **not** installed. Their SQL cannot be executed or tested against the current production schema without an explicitly authorized migration.

## Focused source verification

- Combined staged-source JavaScript harness: **41/41 passing**:
  - Steps 1–3 predictive navigation, security and fog: 21/21
  - Step 4 cross-unit movement compatibility: 12/12
  - Step 5 SQL/JS protocol, release gate and authorization consistency: 8/8
- The harness uses actual branch source fetched from GitHub and executes pure modules plus source-level contract assertions. It is **not** equivalent to Vite compiling React JSX or to an authenticated PostgreSQL integration test.
- Added staging-only `.github/workflows/staging-movement-validation.yml` to run `npm test`, `npm run lint:critical` and `npm run build` on branch pushes. No Vercel, production credentials, database migration or publishing step.
- Extended `eslint.config.mjs` critical coverage to all new security and movement modules, and configured the existing CodeQL workflow to scan the staging branch.
- GitHub connector exposes **no reported combined status** and its workflow-run lookup only returns pull-request-triggered runs; a successful Actions or CodeQL result is **not verified**. Do not mark CI green without viewing their actual outcome.
- There is no `package-lock.json` in the repository. The branch-only validation uses `npm install`, not reproducible `npm ci`; lockfile generation/reproducibility remains a release-hardening item.

## Current release blockers — must not be called finished

1. **GitHub execution evidence:** obtain and inspect full npm test, critical lint, Vite bundle and CodeQL results; correct all failures on the same staging branch before release.
2. **SQL compilation and privilege impersonation:** test staged SQL functions/triggers under `anon`, an authorized player, a foreign player and DM, then validate RLS against wrong campaign, hidden NPC and private tool queries. Currently no separate database test environment is configured, and no production schema writes are permitted.
3. **Multiplayer browser acceptance:** at least DM + 2 player sessions; token/group/tool movement, 1×1–4×4 footprints, assigned maps, dark corners, door opening/closing, conditional attributes, fog revocation, cancellation, out-and-back movement, reconnects, preview-only movement, owner demotion.
4. **Performance and memory:** measure client paint latency, remote observer movement p95, `navigation-grant-rpc` p95, Supabase total queries/WAL and memory commitment on sparse and dense wall scenes. The collision-enabled attribute-change trigger may increase the number of map viewer-tick recalculations; assess before rollout.
5. **Architectural privacy tradeoff:** local, precomputed edge masks reveal passability within authorized sight. Truly undiscoverable invisible barriers require a separately designed limited on-demand permission check if that secrecy guarantee is mandatory.
6. **Existing security/performance advisor findings:** read-only Supabase advisors on 2026-11-09 reported 58 baseline security notices (including 51 intentionally reviewable authenticated SECURITY DEFINER endpoints) and 54 performance notices. These predate installing the new migrations and cannot be attributed to their new schema. Audit relevant public functions for intended access; do not blindly revoke active application RPCs.

## Release choreography after explicit designer permission

- Freeze the branch head and verify no outstanding Step 1–4 conflicts, check published rules and session permissions, capture current production migration versions, and obtain a database backup/restore point as available on the Free plan.
- Execute all three SQL migrations **in order as a controlled release**, auditing permissions, published viewer ticks and Realtime identity and validating `get_authorized_map_navigation` before exposing the frontend.
- Deploy the **complete** consolidated branch as a single application release within the existing Vercel quota. Run the test-campaign acceptance matrix, diagnose errors from live sessions and record p95 metrics before declaring success.
- If auth, fog or movement fails, stop the new client rollout and restore the prior known-working build with matching compatible server functions and server collision protections. Never disable server authoritative collision, remove RLS or expose wall geometry to force movement to appear smooth.

This step prepares engineering integration and records the release gates; **it does not authorize, perform or claim live release acceptance**.
