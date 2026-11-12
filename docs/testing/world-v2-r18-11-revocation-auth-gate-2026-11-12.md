# B10-R18-11 — Revocation-correct viewer sight and renderer privacy gate

**12 November 2026 · Staging only / NO-GO.** Parent is exact R18-10 draft PR #112 HEAD `28b43c14ddf6ec721680cc7ba0537685d0ed1fc2`. Live production remains R16 `main@90df8c960e79e8d66c322095611427da7bb09de4`. No merge, deployment, environment change, database writes, or activation of observer feature flags.

## Why this step

R18-10 fixed a default-off guarded observer case in which private hide/vision invalidation could be ignored while waiting for new signed sight. Its earlier tests exercised transport callbacks but not full fog/sprite presentation. Existing SQL suites test viewer LOS and private topic RLS separately; no isolated test covers a cached viewer entitlement after a campaign-member removal and a DM-to-player downgrade in the same source-real integration history. This step closes those gaps without changing runtime behavior or the frozen B10 R05 SQL.

## Files and verification

1. `tests/sql/world-engine-v2-r18-11-revocation-auth-contract.sql`: source-real PostgreSQL 17 fixture using the existing Phase 5–10 migrations, real `get_world_visibility_v2`, `get_world_observer_cursor_v2`, `preview_world_visibility_v2`, and private `realtime.messages` RLS. P1 starts with authorized sight/topic; member removal denies both without changing the simulated JWT; rejoin restores own authorized scope. P2 is assigned to another map and cannot obtain P1 map/sight/topic. DM initially has full DM sight; role demotion to `player` removes DM-only hidden NPC and preview capabilities. All test-only writes are enclosed in a transaction that ROLLBACKs.
2. `.github/workflows/staging-world-engine-v2-sql.yml`: runs the role matrix after the existing disposable PostgreSQL 17 Phase 10 suite. No linked Supabase credentials or production DB access.
3. `tests/world-v2-r18-11-renderer-auth-revocation.test.mjs`: actual `WorldRenderer` plus `RealtimeTransport` against controlled signed-sight fixtures. Private hide or vision-dirty during optional guarded recovery removes sprites and blackens fog synchronously; late abandoned-generation signed responses cannot repaint concealed actors. A contract check guards the SQL test and workflow wiring.
4. Staging release ledger and readiness retain prior stacked branches, no production approval and default-OFF guarded recovery.

## Scope and important limits

Synthetic PostgreSQL roles and JWT settings are not a real Supabase Auth socket or proof of an actual connected WebSocket disconnect. The renderer tests use production presentation and transport code but synthetic signed sight. This test does not execute a linked Supabase CLI migration fetch/dry-run, install the frozen R05 SQL, or establish three actual signed-in browser account results.

Previously delivered private WebSocket messages cannot be retroactively erased by database RLS. The production client must still conceal on invalidation, and real role revocation must be checked end-to-end on a live test campaign. The tests verify fresh requests after changed authorization, not guaranteed revocation notification delivery timing.

## Remaining NO-GO gates

- Exact-head Node/Vite/dependency audit/CodeQL/source-real PG and B10 combined PG17 must be green.
- A secure isolated Supabase CLI v2.81.3 linked workspace must fetch and independently compare 83 remote migration versions and SQL bodies, prove exactly the frozen R05 candidate pending, and capture a genuine dry run. Do not generic-push from repo (55 local distinct migration versions). The R18-09 transcript parser alone does not authenticate execution.
- Separately approve one frontend client test canary with 12-second signed recovery ON and 700ms guarded recovery OFF; exercise authenticated DM/P1/passive P2, LOS, fog, revocation, hidden NPC, blocked walls and free-tier budget.
- Separately approve exact frozen R05 SQL after fresh source function hashes, 0 active motion sessions and verified isolated historical CLI comparison. Complete post-SQL 24-case protected acceptance and RAM/p95 latency checks. No guarded-mode activation without further authorization.

**Release decision: DRAFT / NO-GO.**
