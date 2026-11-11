# B10-R13 — Visibility latency source classification (client-only)

**11 November 2026.** Staged separately from the SQL-dependent R05–R09 branches and based on last demonstrated live working production commit `7079d189aad34679ca5b5d577fafcd8f1ba6a26d`.

## Evidence and precise interpretation

Two independent active-player traces after PR #97, with 7/7 and 27/27 successful gestures and no movement rejections. The second trace includes 6 `movement.canonical-handoff` events and reports no flashing. However, 27 local `movement.grabbed` events mean the second account is **also moving**; it is *not* the missing passive-only observer trace. The rolling 256-event ring omitted initial startup; its cumulative renderer seals and removals cannot be placed on a timeline or assumed to occur while moving.

Player 2's `visibility.rpc` p50 216.2ms, p95 2472.8ms and max 6127.7ms (35 measured requests) versus renderer `render.frame` p95 0.1ms (256). The existing trace brackets the actual `db.rpc()` promise; queue waiting is NOT part of those 6.1 seconds. Cumulative live `pg_stat_statements` for primary visibility RPC was 918 calls, 43.5ms mean DB execution and 1856.5ms maximum DB execution, across releases, not directly comparable with per-browser p95. PostgreSQL was 17.11 with 29 database connections and 2 active on one read-only spot check. No evidence yet distinguishes a particular network, API gateway, pool or Postgres delay.

## Minimal staged measurement (no optimization yet)

Opt-in `worldV2Trace=1` gains:
- `visibility.rpc-call`: whitelisted existing request trigger (committed, observer-resync, scene-current, queued, manual, etc.); no user/page/key content.
- `visibility.rpc-tail`: only aggregated monotonic wall-time bucket for actual `db.rpc()` (over-750ms / over-2s / over-5s), never the request payload.
- `visibility.queue`: queued, coalesced, drained or discarded in the *existing one-bit, one-in-flight* queue.
- `visibility.queue-wait`: separate bounded p50/p95/max of time a coalesced sight refresh waited behind an existing RPC.

Add opt-in trace + monotonic clock dependency injection only for deterministic tests. The existing queue scheduling, response adoption, RLS authorization, scene/permission/version checks, revocations, fog/raster and private observer stream are **unchanged**; no new/removed/parallel RPCs, no timers, no subscriptions and no SQL.

## Acceptance and abort gates

Automated tests must prove exact RPC request count/order with overlapping refreshes, queue-wait metrics, reason/tail classifications, revocation during outstanding in-flight request (no authorization resurrection, no queued retry), fail-closed malformed sight and privacy. Run full Node+Chromium, Vite, PostgreSQL 17 and CodeQL on exact head. Only if green may a tiny diagnostics-only Vercel release be considered; free-tier support and complete change isolation must be confirmed.

The next human test is one **passive observer profile** (zero `movement.grabbed` events) while another distinct signed-in user moves for 30–60 seconds. Capture separate mover + observer traces after clearing startup events, so `visibility.rpc-tail` events can be attributed to `visibility.rpc-call` reason and queue-wait separately. Confirm no invalid frames, renderer seals, unintended fog blackouts, sprite removals or terrain reassignments during ordinary movement.

**Do NOT** claim the R05 global SQL trajectory overhaul is ready. Its migration-history drift, all-map client compatibility and protected 24-case DM/P1/P2 security tests remain unresolved. Preserve `main@7079d189aad34679ca5b5d577fafcd8f1ba6a26d` as the proven performance/functionality baseline until a release is independently qualified.

**Next B10-R14:** after comparable live traces, identify cause of outlier RPC duration; then if proven safe, eliminate redundant *exact-equivalent* refreshes without skipping permission, epoch, sight, scene or fog invalidations. If it is external/server-side latency, address pooling/SQL performance separately with repeatable metrics and history-safe migration controls.
