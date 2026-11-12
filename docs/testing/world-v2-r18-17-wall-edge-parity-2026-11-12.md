# B10-R18-17 — Coordinated 0.10-cell wall-edge clearance implementation

**12 November 2026 (Australia/Melbourne) · STAGED ENGINEERING, no release, no DB writes.**

## Scope, parent, and authority

Parent R18-16 draft PR #118 exact SHA `48f98e771c526ddd7945f3b5daa1d7d6f78c6a5e`; R18-17 is a separate next incremental stage. The current live frontend is the R18-15 Vercel production-target canary `dpl_E1P6cNfuswAMH7qAFnSLPrTWN6kQ` from `7628a319b8c62bf18a4046fffc7bb4b8f28d67be`. GitHub `main` remains R16 `90df8c960e79e8d66c322095611427da7bb09de4`. The frozen R05 backend migration `supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql` remains unapplied and UNMODIFIED.

The user delegated further **staging engineering**, not SQL production installation or another frontend live release. The R18-17 candidate must not be merged, promoted or invoked on the connected Supabase project.

## Precise physical contract

Published solid walls and doors are mathematically **zero-thickness polylines** in map grid coordinates, not filled tiles. A "10% covered tile" is therefore modeled as **0.10 grid-cell units** of permitted clipping into the token/tool's outer footprint band per axis; it is neither 10% of wall area nor 10% of a large token's 2x2 area.

For each server-validated movement segment, compute the same swept convex rectangle between the two approved points but inset its x/y corners by `min(0.10,spanX/4)` and `min(0.10,spanY/4)`. Check actual wall segment intersection against that entire **inner swept** region, not only the destination or center at one timestamp. Keep the actual full footprint for map edges. This intentionally tolerates shallow edge overlap without allowing a thin solid wall to pass through the token's interior.

Illustrative, approved physical geometry examples (1x1 token, from cell 0→1 moving right, unit-length vertical wall): wall x=1.95 **allowed** (outer 0.05 overlap); wall x=1.8 **blocked** (0.2 overlap); x=1.05 **blocked** (actual crossing); x=2.0 **allowed** (boundary touch). Fast x=0→3, diagonals and large-piece internal wall cuts remain blocked. Open/broken door and conditional attribute wall passage still runs before geometric collision. Wall light permeability/one-way LOS does **not** grant physical passage; neither vision nor fog geometry is changed.

The rule preserves closed windows, groups, mounted tools, map bounds, published environment revision, permission generation, private signed visibility and server-only canonical commits. A client may never use a local result as proof of map membership or a hidden wall. The Stage R18-17 implementation rejects clearance magnitudes other than exactly 0 or 0.10; it never accepts arbitrary user-specified larger tolerances.

## What is actually implemented

1. `src/engine/v2/CollisionGeometry.js`: new `segmentCrossesSweptFootprintWithClearance` and constant `WORLD_V2_WALL_EDGE_CLEARANCE_CELLS=0.10`. Strict default 0; malformed parameters return **true=blocked** (fail closed). The existing strict function is unchanged and still exported.
2. `src/engine/v2/CollisionSolver.js`: scene compiler accepts explicit `clearanceCells` (default **0**). Broad-phase uses the full swept bounds (conservative), narrow-phase applies the *optional* insetting, including the earliest impact and any slide candidate. Map edges continue to use the FULL rectangle.
3. `supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql`: **not a migration**, not applied. Two identically typed `CREATE OR REPLACE` functions, `forge_world_v2.swept_hits_segment` and `forge_visibility.swept_hits_segment`, use matching `least(0.10,w/4.0)` / `least(0.10,h/4.0)` arrays in the original SAT intersection procedure. Function names/signatures, security invoker mode, immutable contract and `SET search_path=''` unchanged. Existing server call sites include V2 `step_allowed` (including R05 B03/advance), legacy direct token/tool movement enforcement and trajectory navigation. Both must change together; do NOT deploy just one.
4. `tests/world-v2-b10-postgres/wall-edge-r18-17.sql`: isolated PG17 `BEGIN` → candidate SQL → **14** source-real assertions → `ROLLBACK`. Tests both SQL helpers, V2 `step_allowed`, high-speed/diagonal/large token, door pass, invalid spans and private schema ACL. The approved existing R05 migration is independently rehearsed afterward.
5. `tests/world-v2-b10-postgres/run.sh`: invokes this rolled-back test after the R03 core/queue tests, never in production.
6. `tests/world-v2-r18-17-wall-edge-parity.test.mjs`: strict default, opt-in 0.10 clearance cases, actual wall crossing, anti-tunneling, diagonal, 2x2 token/group/tool, door/bounds, malformed geometry denial, and independent signed/entitled authorizer requirement. Exact source asserts runtime not automatically enabled.

## Important release blockers, deliberately left explicit

**Client default is still strict.** No active `SceneManager` or `WorldV2TabletopRuntime` call supplies `clearanceCells:0.10`; therefore even a later frontend build won't silently change collision behavior. This prevents optimistic DM prediction while the live PostgreSQL authority still rejects shallow contacts. A subsequent final integration stage must coordinate feature activation **only after the server is verified compatible**, and check all public/legacy direct-write guards. Until then, local tests exercise the opt-in scene compiler in isolation.

**Not yet a versioned migration:** The pinned authenticated Supabase CLI is unavailable in connected tools. An operator must use the reviewed isolated CLI/historical migration workflow to generate the **next real version** (after R05) from this frozen candidate, verify the actual 83 remote migration history files, 83 SQL-body hashes and exactly the pending ordered migration list. Do NOT create a fake version from a filename, apply this SQL with `execute_sql`, or run repo-root `supabase db push`.

**Direct-write security gap to finish before SQL:** Although the SQL replacement covers the exact existing `forge_visibility.swept_hits_segment` signature called by legacy token/tool triggers, source-real direct token and tool `UPDATE` and `forge_visibility.validate_piece_trajectory` adversarial tests are still required on a disposable schema. The current 14 tests confirm helper behavior, V2 authority and no relaxation of the private V2 schema; they do **not** constitute full legacy trigger acceptance.

**Observer / fog gate:** Independently authenticated P1 and passive P2 must show canonical convergence, hidden wall/LOS protection, no unauthorized observer geometry or NPC identities, and immediate private revocation. DM preview does NOT substitute for these tests. Guarded 700ms observer recovery remains OFF. The R05 SQL remains separately gated and frozen.

**Performance gate:** R18-17 changes only collision predicates. It does NOT fix 1s median commits, 2.38s post-release p95 lock or cumulative network/transport latency. R18-16 opt-in categorized timing diagnostics are retained in this stack, but need a separately approved frontend canary and comparable early/late DM sessions to attribute slowdowns.

## Rollout recommendation — not executed

1. Finish direct-write token/tool/conditional-wall/large-piece source-real SQL parity and signed-vision revocation checks in independent staging.
2. Reconcile the production migration ledger safely via real pinned Supabase CLI, obtain **separate explicit backend SQL approval**, apply R05 and then a correctly versioned R18-17 migration with verified order; never overwrite the frozen R05 blob.
3. Verify PostgreSQL function definition hashes, ACLs, collision fixture results and no regressions. Only after SQL compatibility is proven, obtain **explicit frontend rollout approval** for the new 0.10-cell preflight behavior (and keep observer 700ms guard OFF).
4. DM repeat wall-corner/fog and sustained movement; with independent player account(s), validate server acceptance, private LOS and passive observer convergence. Preserve old R18-15 Vercel deployment for rollback.

**Disposition: reviewed implementation candidate with strict default and real isolated PG tests. NO-GO for live activation, migration or merge.**
