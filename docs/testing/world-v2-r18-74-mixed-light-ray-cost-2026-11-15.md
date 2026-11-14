# B10-R18-74 — Mixed wall + authored-light function cost attribution

**15 November 2026 (Australia/Melbourne) · Disposable PostgreSQL 17 only · source-real experiment · DRAFT / NO-DEPLOY**

## Why change investigative direction

R18-70–72 established a plausible PostgreSQL cost for repeatedly walking exact duplicate plain walls in a deliberately synthetic scene. R18-73 measured the actual linked Supabase published scene category totals **read-only**: two live scene rows, one wall object and two scene light objects overall, no whole-scene candidate that meets the narrow R18-72 all-plain-wall eligibility rule. The linked project still showed **83 applied migration records** at that read-only snapshot. Real authorized maps may still be completely different from any local fixture; those aggregate categories do not describe object placement, active lighting, viewer layout, source tokens, cross-scene equivalence or user RTT.

The conclusion was **not** to install or broaden R18-72's transient deduplication. Instead R18-74 measures both relevant *unmodified* private function families in **synthetic category-matched mixed scenarios**, retaining exact original-vs-R18-57 whole-frame parity.

## Source, isolation and containment

One new `tests/world-v2-b10-postgres/r74-mixed-light-ray-cost-profile.sql` is included inside the existing R18-57 source-real `BEGIN/ROLLBACK`, after R18-72's private function source/ACL restore, and before R18-57's existing signed Begin–Advance–Commit/collision/revocation and original candidate rollback. It runs only on database `world_v2_b10_r05`, as `postgres`, with the exact 91-history **synthetic** fixture, eight source-real fixture memberships, sealed R18-57 private frame digest and pinned original `ray_blocked`, `is_lit`, and `wall_passes` digests and restricted schema/function ACLs. No app, live database, field flags, grants, migration files, deployment, SQL source, or real player IDs change.

Six synthetic measured scenarios use exactly one blocking geometry object (wall or closed/open door) plus **two authored light objects**. They cover ambient darkness `0`, dim ambient `25`, bright ambient `60`, a closed door, an open door, and disabled lights. Four *additional parity-only* scenarios exercise one-way vision, curtains/closed window, malformed light coordinates and party-shared exploration. The test explicitly asserts one wall and two lights in the simple dark scene. These coordinates and objects are locally invented **tests**, never copied from production; the live linked audit exposed only aggregate object families.

For each of six measured scenarios, compare **two orders** (original→fastpath, then fastpath→original) across **two repetitions**, each variant producing exactly eight complete protected viewer frames: **6 × 2 × 2 × 8 = 192** instrumented frames. Capture transaction-local `pg_stat_xact_user_functions` delta **calls** and **self-time milliseconds** separately for original private `ray_blocked`, `is_lit`, `wall_passes`, and `cross2`, together with aggregate elapsed time per eight frames. `SET LOCAL track_functions='all'` applies only inside the original disposable transaction, is restored to `none` before original R18-57 Commit timings, and cannot reset global statistics.

The test then verifies **10 scenes × 8 viewers = 80** whole source-original vs sealed-fastpath private JSONB frame equalities (not just visible-cell counts), plus **8 additional full frame comparisons** with a temporary equipped tool torch against a mixed authored-light wall scene. Torch data is created and rolled back inside its own SAVEPOINT. A separate SAVEPOINT changes one fixture viewer to spectator, requires both original and fastpath to deny that viewer, then rolls back. Finally it restores the exact original published scene, original 8-viewer roster and ACL, confirms exact function MD5 values and no torch residue; the original signed Commit/rollback suite then continues unchanged.

## Interpretation limits

- `ray_blocked` includes both **vision** and nested **light** mode calls. The built-in transaction statistics aggregate the same PostgreSQL function name and **cannot separate those ray modes**. A dedicated future source-safe instrumented helper would be required to measure modes individually; never invent a light-ray-versus-vision-ray split from these counters.
- `self_time` is **exclusive of tracked nested function calls**. Do not claim self-time for `is_lit` includes all nested `ray_blocked` or sum totals as if they were the user's browser duration.
- Source-real synthetic PG17 data does **not** measure hosted Supabase read I/O, locks, contention, Free-tier memory, network RTT, browser p95, or actual DM/P1/P2 session delivery. Comparing R18-57 and original under tracking is diagnostic and can suffer warm-cache/order bias. No performance acceptance threshold or release decision can be inferred from timing samples.
- The original `is_lit` can return early under ambient light and may invoke further original rays for authored or tool light. The sealed R18-57 candidate skips original `is_lit` only when its pinned source proves a safe shortcut. Exact full-frame equality and revoked sight denial remain mandatory.

## Measured source-real result — 15 November 2026

The source-real PostgreSQL 17 fog workflow passed on staged source SHA `9930166f01312c600f6da1eafc8fb8286dc95051`, alongside exact-head Node/Chromium/build/lint/Edge/audit, isolated PG17 movement authority and CodeQL. **1,220 automated tests passed, zero failed**; npm production dependency audit reported **zero vulnerabilities**. The original isolated R57 signed Commit, collision, source-drift negative gates and rollback completed after this experiment; no deployment occurred.

The experiment verified **192 complete instrumented frames**, **80/80 complete original-versus-R18-57 private frame matches** in ten mixed/hostile scenes, **8/8 torch+authored-light matches**, revoked-viewer denial by both private variants, and exact original private source/ACL restoration. R74's first local CI attempts caught two *harness-only* mistakes, corrected before this passing head: R72 timing rows intentionally disappear when R72's SAVEPOINT rolls back; PL/pgSQL loop variables must not conflict with sampled column names. Neither repair changed the original gameplay or private visibility functions.

**PG17 transaction-local measurements, means of two eight-viewer frame sets per variant** (instrumentation overhead; not production browser p95):

| Synthetic scenario | Variant | 8-frame elapsed | `ray_blocked` calls | `is_lit` calls | `cross2` calls |
|---|---|---:|---:|---:|---:|
| 1 wall + 2 lights, ambient 0 | Original | 234.777 ms | 3,414 | 1,160 | 13,404 |
| 1 wall + 2 lights, ambient 0 | R18-57 fastpath | 234.274 ms | 3,414 | 1,160 | 13,404 |
| 1 wall + 2 lights, ambient 25 | Original | 187.074 ms | 2,611 | 1,160 | 10,192 |
| 1 wall + 2 lights, ambient 25 | R18-57 fastpath | 195.482 ms | 2,611 | 1,160 | 10,192 |
| 1 wall + 2 lights, ambient 60 | Original | 130.252 ms | 1,841 | 1,160 | 7,112 |
| 1 wall + 2 lights, ambient 60 | R18-57 fastpath | 121.968 ms | 1,841 | **0** | 7,112 |
| Closed door + 2 lights, ambient 0 | Original | 237.923 ms | 3,414 | 1,160 | 13,404 |
| Closed door + 2 lights, ambient 0 | R18-57 fastpath | 241.109 ms | 3,414 | 1,160 | 13,404 |
| Open door + 2 lights, ambient 0 | Original | 155.161 ms | 3,610 | 1,841 | 3,610 |
| Open door + 2 lights, ambient 0 | R18-57 fastpath | 155.817 ms | 3,610 | 1,841 | 3,610 |
| Disabled lights + 1 wall, ambient 0 | Original | 179.535 ms | 1,841 | 1,160 | 7,112 |
| Disabled lights + 1 wall, ambient 0 | R18-57 fastpath | 180.932 ms | 1,841 | 1,160 | 7,112 |

In the dark 1-wall/2-light R18-57 fastpath frame set, the exclusive tracked `cross2` self-time alone was **120.877 ms** across **13,404** calls; tracked `ray_blocked` exclusive self-time was **62.526 ms**, and `is_lit` exclusive self-time was **17.767 ms**. The nested function-call accounting is **not** a clean production latency attribution and these per-function statistics do not separate sight and lighting ray modes.

**Engineering interpretation:** Original and R18-57 execute the same number of ray, lighting and cross-product calls in the dark/dim scenarios; fastpath largely helps when its sealed ambient=60 shortcut can omit the original `is_lit` call (while preserving exact visibility). The repeated intersection primitive is a credible next area for a **separate reversible test-only study**, especially with variable door/window/one-way semantics, but this local sample cannot justify changing `cross2` or shipping an optimization. Leave existing movement/fog authority and production unchanged.

## Release decision

**R18-74 engineering completion requires** all exact-head CI workflows green: Node/Chromium/build/lint/production dependency audit/Deno Edge, isolated original PostgreSQL World V2 authority, source-real fog/negative/rollback and CodeQL. No future runtime optimization may ship until it has its own reversible, source-sealed gated candidate and hostile-scene parity.

**Production release remains NO-GO** until official authenticated pinned Supabase CLI v2.81.3 exact 83+8 linked history/list/ `db push --dry-run`, independently signed DM/P1/passive-P2 browser movement/collision/visibility/revocation tests, browser RPC p95, Supabase Free RAM/locks and operator approval. OAuth preview already passed and is not a substitute for V2 multiplayer testing.
