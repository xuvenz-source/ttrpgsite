# B10-R18-71 — Isolate wall-shape traversal cost without changing private LOS

**14 November 2026 · Disposable PostgreSQL source-real experiment only · DRAFT / NO-DEPLOY.**

## Decision from R18-70

Eight simulated viewer frames on the R18-57 opt-in candidate still invoked the original private `forge_visibility.ray_blocked` **782** times in the original 24-wall scene, consuming approximately **54.909 ms measured self-time** in the instrumented PostgreSQL 17 transaction. The original variant made 1,841 calls in the same scene. `is_lit` was bypassed for this ambient/no-light fixture only. Neither sample is hosted browser RTT or a production p95.

Review of the **source-pinned** original ray implementation shows that it iterates up to 120 published scene objects, then walks 2–80 wall/door/window vertices, evaluating `wall_passes` (which includes door/window states, direction and character-dependent checks) before exact cross-product intersection tests. On parse or evaluation errors, it returns **blocked**. The original ray may stop at an early intersection or traverse every segment. It is not safe to replace this with a generic cached visibility mask, a raw bounding-box shortcut or a simplified collision test.

The existing 24-wall benchmark is a useful controlled case: it contains **three identical copies each of eight solid wall objects**. That duplication is a property of the *synthetic fixture*, not evidence that actual DM-authored walls are duplicates. This step tests the cost consequence; it does **not** deduplicate actual walls.

## R18-71 experiment

The source-real R18-57 PG17 suite includes `tests/world-v2-b10-postgres/r71-wall-ray-shape-cost-controls.sql` immediately **after R18-70 attribution** and before original signed Commit, revocation and rollback tests. It executes only within the existing disposable `BEGIN/ROLLBACK`. It refuses any database/role other than the pinned fixture, checks the 91 synthetic migrations, original ray **MD5 `a9fc198168c29fd5d80041b05337017e`**, exact R18-57 private frame digest and private client-denial ACL. Tracking is `SET LOCAL track_functions='all'` and returns to `none` before the original uninstrumented Commit benchmarks.

It compares three derived **test-only published scenes**: the original 24 repeated solid-wall entries; eight exact-distinct entries; and all original 24 entries in reverse order. In each, it separately samples the original and sealed R18-57 fastpath, two order-balanced repetitions of **eight complete frames**. Total diagnostic frames: 3 × 2 × 2 × 8 = **96**. Ray call counts, ray self-milliseconds and aggregate eight-frame elapsed time come from transaction-local function statistics. It then separately checks **24 complete private original-vs-fastpath JSONB frame equalities** (3 scenes × 8 viewers), restores the original environment, and proceeds to the pre-existing signed movement, rollback and revocation suite.

Only shape labels and aggregate statistics are printed. No player identifiers, scene geometry, private visible/explored arrays, bearer tokens or signed receipts appear in logs. Statistical instrumentation adds overhead; *no speed-improvement threshold is asserted* and the compared scenarios may have equivalent visibility for solid duplicates but are **not interchangeable for arbitrary authored or conditional objects**.

## Exact original-head initial CI measurement (14 Nov 2026)

The first three workflows passed at original step SHA `d4a03bc7b9064bca4e6984acd18a29321d46a773`: Node/Chromium/lint/Vite/Edge/npm audit (**1,195 passed, 0 failed**), disposable combined PG17, and source-real R54–R57 fog/rollback. All three are staging-only.

Two independent PostgreSQL 17 CI runners produced **different absolute timings but the same directional finding** (all numbers below are local, instrumented means of two repetitions of eight frames; never combine them as a single benchmark):

| Runner | Candidate scene | Mean ray calls | Mean ray self-time | Mean eight-frame elapsed |
|---|---|---:|---:|---:|
| Combined PG17 | 24 repeated walls | 782 | 41.628 ms | 117.754 ms |
| Combined PG17 | 8 exact-distinct walls | 782 | 19.539 ms | 66.078 ms |
| Combined PG17 | 24 reversed walls | 782 | 42.386 ms | 120.216 ms |
| Source-real fog PG17 | 24 repeated walls | 782 | 60.091 ms | 171.359 ms |
| Source-real fog PG17 | 8 exact-distinct walls | 782 | 30.804 ms | 101.925 ms |
| Source-real fog PG17 | 24 reversed walls | 782 | 61.811 ms | 175.466 ms |

The **ray call count stays at 782**. Reducing this deliberately duplicated test geometry from 24 objects to eight is associated with **53.1% and 48.7% less instrumented ray self-time**, respectively; reversing the original wall order had little effect. This points to repeated geometry traversal/decoding rather than wall ordering as a meaningful cost in this one fixture. It does **not** authorize deduplication of real walls, prove all 782 ray checks are avoidable, or establish production p95. Original-vs-fastpath complete private JSONB parity passed **24/24** across the three test shapes; existing R18-69 72-frame parity, R18-57 source rollback, signed movement and revocation remained intact.

**Follow-on candidate rule:** only consider a validated per-frame geometry representation with strict source-equivalent parse-error, wall/door/window, conditional access and edge intersection behavior and no stale data across changed maps, doors or permissions. A change must be a separate opt-in rollback-safe candidate and pass original-vs-candidate hostile-scene parity before any deployment discussion.

## Exit gates and next decision

1. All six adversarial Node static checks and the source-real PostgreSQL suite, original R54–R57 fog/rollback, isolated PG17 movement authority, build/lint/audit and CodeQL must pass at the **exact PR head**.
2. If the measured ray self-time meaningfully falls with eight unique objects or changes with ordering, repeated traversal and early exits are worth further targeted experiments. Any eventual optimization needs **new, separately reversible guarded source candidate**, original-vs-new complete-frame parity for hostile/shared/door/window/one-way/torch/malformed geometry, revocation and signed Commit, without relaxing fail-closed behavior.
3. No source-only performance result can authorize a production install. The exact 83+8 authenticated official Supabase CLI rehearsal, operator approval, independent signed DM/P1/passive-P2 QA and Supabase Free RAM/locks/browser p95 remain hard blockers.

**Release decision: NO-GO.** No Vercel promotion, SQL migrations, runtime fog, collision logic, grants, feature flags or remote data are modified.
