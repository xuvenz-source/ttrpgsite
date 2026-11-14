# B10-R18-75 — Original cross-product equivalence and timing probe

**15 November 2026 · Draft / no deployment · disposable PostgreSQL 17 ONLY.**

**Direct predecessor:** R18-74 PR #176 exact commit `84bedb4bae378ff5ac68473c763baa737054f4cc`. The original incremental engineering gates still apply: one isolated reversible change, source-fidelity and security/rollback validation, exact-head CI, unmerged staging, no production alterations and no unsupported speed claims.

## Hypothesis

R18-74's synthetic mixed dark wall + two-light fixture executed **13,404** `cross2` function calls across eight protected frames, costing approximately **123 ms instrumented function self-time**. The original source is a SQL function returning `ax*b_y - ay*bx`, marked `IMMUTABLE` with a `search_path` setting. Invoking that function repeatedly may cost more than performing the identical double-precision arithmetic inside the private `ray_blocked` loop. The original also handles conditional wall/portal state and fail-closed invalid geometry, which must be preserved exactly. This test **does not assume Postgres cannot already inline the helper**; actual tracked function counts and timings must decide.

## Source-exact disposable experiment

One new SQL test, `tests/world-v2-b10-postgres/r75-inline-ray-cross2-parity.sql`, runs **after R18-74** but inside the existing source-real R18-57 `BEGIN/ROLLBACK`, before the unchanged signed R18-57 Commit/collision and rollback checks. It requires the exact isolated `world_v2_b10_r05` fixture, 91 synthetic history rows, eight player fixture memberships, exact 83-history original `ray_blocked`, `cross2`, `is_lit`, and sealed R18-57 private frame function digests, and restricted private access.

It first stores the original source results in disposable temporary tables: **33 scenes** (23 R18-72 hostile/conditional examples and 10 R18-74 mixed wall/light/portal scenarios); **12 directed, near-boundary and same-point rays per scene** × **3 modes** (vision/light/movement) × **2 character attribute inputs** = **2,376 original boolean ray results**. It also captures **528 complete original protected fog frames** (33 scenes × eight viewers × original/fastpath), and **16 original protected torch+authored-light frames**. These private JSONB frames are never printed or exported.

Only then does a dedicated `SAVEPOINT` derive a transient, test-only replacement of the exact source text returned by PostgreSQL `pg_get_functiondef` for `forge_visibility.ray_blocked`. Four exact source anchors are required **once each**. Each `forge_visibility.cross2` invocation is replaced by the equivalent `((ax*by)-(ay*bx))` arithmetic with matching argument order; all ray source conditions, side choice, epsilon, per-wall permissions, early exits and fail-closed handling remain verbatim. The existing `cross2` function remains unchanged. The candidate must retain the original ray's PostgreSQL owner, ACL, volatility, security and search_path.

The test compares all **2,376 Boolean rays**, all **528 full private frames** and **16 torch frames**, without converting to counts or hashes. It revokes a fixture viewer inside a nested SAVEPOINT and requires both protected frame implementations to deny access. The only performance comparison is the **three selected synthetic mixed-light scene types × two repeats × eight viewers × source/inlined** (96 measured complete frames). Transaction-local `pg_stat_xact_user_functions` records original ray and cross2 calls/self-time and eight-frame elapsed time. All values are local and instrumented, with **sequential baseline then candidate**, which can bias warm cache or execution plan; no p95 or production speed-up claim is allowed.

The main probe SAVEPOINT is rolled back in full, including its transient ray function and sample rows. The test checks the exact original source digests, security metadata, viewer roster, empty torch fixture, original map environment and restored `track_functions='none'` before unchanged R18-57 signed collision/Commit/negative and rollback tests. **No new migration, installable candidate, production SQL, grant or runtime code is created.**

## Source-real PostgreSQL measurements — first exact-head run

The source-real fog workflow passed on commit `3f135aa3853b6f4a613c964f80ab9d4d7a8e1f13`. All four independent workflows succeeded: Node/Chromium/build/lint/audit/Edge **1,230 passed, zero failed**, zero npm production vulnerabilities; source-real R54–R57 fog and rollback; isolated PostgreSQL V2 authority; and CodeQL.

The test compared **2,376/2,376 original-vs-inlined direct rays**, **528/528 complete original private fog frames**, **16/16 complete torch/scene-light frames**, and explicitly denied a revoked fixture viewer. The exact original `ray_blocked` and `cross2` function MD5s, owner, ACL, volatility and security attributes were restored by SAVEPOINT rollback before the pre-existing signed R57 Commit/collision/rollback suite, which also passed.

**Instrumented PostgreSQL 17 means, two sequential eight-viewer repetitions per variant** — separate source baseline was completed before the inline candidate was installed. These are intentionally *not interleaved or statistically independent*, and instrumentation adds overhead.

| Synthetic scene | Source mean 8-frame elapsed | Inline mean 8-frame elapsed | Reduction observed | `ray_blocked` calls (both) | `cross2` calls (source → inline) |
|---|---:|---:|---:|---:|---:|
| 1 wall + 2 lights, dark | 245.117 ms | 92.899 ms | 62.1% | 3,414 | 13,404 → 0 |
| 1 wall + 2 lights, dim | 190.422 ms | 73.994 ms | 61.1% | 2,611 | 10,192 → 0 |
| Closed door + 2 lights, dark | 248.593 ms | 93.445 ms | 62.4% | 3,414 | 13,404 → 0 |

For dark wall+lights, exclusive `ray_blocked` self-time was **66.484 ms source → 46.338 ms inlined**; `cross2` separately attributed self-time **121.557 ms source → 0 ms helper calls inlined**. This is consistent with material SQL helper-invocation overhead in the isolated fixture, but the arithmetic now executes inside the ray function and there can be other timings/costs. Never sum function self-time and call it entire client latency. A baseline-first, then inlined, sampling order is susceptible to cache and compiler warm-up effects; use a separately balanced A/B/A or B/A/B experiment before asserting production causal improvement.

**Decision:** Source-equivalent *under this bounded adversarial fixture*: PASS. The result justifies a separately reviewed reversible *candidate design*, not deployment. Before touching runtime, expand hostile float-boundary, condition-specific, malformed geometry and light-path parity; include source-real round-trip alternating order and require authentication, signed movement authority, runtime memory and real browser QA gates.

## Exit and release gates

All four exact-head workflows must succeed: Node/Chromium/build/lint/Deno Edge/dependency audit; source-real PostgreSQL R18-54–R18-57 signed fog/rollback; isolated PostgreSQL movement authority; CodeQL. Any original-vs-inlined mismatch or missing/changed privileges **fails the step**, not a reason to relax the original source or visibility.

Performance results can motivate a **separate, opt-in, reversible source candidate** only if there is both robust equivalence and credible savings across representative scenes. The connected Supabase's two published map environment records were seen to include **one wall and two lights total** in R18-73's read-only historical snapshot, which is not sufficient to infer real visibility load, geometry details or performance impact. Do not deduplicate or rewrite authored maps to fit a synthetic test.

**Production: NO-GO.** Authentic official pinned Supabase CLI v2.81.3 linked 83+8 history/fetch/list/`db push --dry-run`, genuine independent signed DM/P1/passive-P2 browser movement/collision/fog/revocation, real browser p95, Supabase Free RAM/locks and explicit release approval remain pending. No live deployment or migration is authorized by this experiment.
