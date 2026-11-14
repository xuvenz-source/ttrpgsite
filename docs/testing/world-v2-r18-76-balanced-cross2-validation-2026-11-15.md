# B10-R18-76 — Symmetric cross-product performance validation and adversarial parity

**15 November 2026 · Disposable source-real PostgreSQL 17 ONLY · DRAFT / NO-DEPLOY**

**Exact parent:** R18-75 PR #177 `e86138f8a11ae68f7f90aa1d1c3eb3dd96ab61ef`. This is the next narrowly bounded increment of Tabletop Forge's approved incremental engineering workflow. It is **not** a runtime candidate, migration, release approval or production deployment.

## Why this step

R18-75 tested replacing four calls to the original immutable `forge_visibility.cross2(ax,ay,bx,by)` (source expression `ax*b_y - ay*bx`) inside `ray_blocked` with the same double-precision multiplication and subtraction. Its source-real fixture preserved **2,376 direct ray booleans**, **528 complete private frames**, **16 torch/light frames**, revocation, owner and permissions, and signed movement. Two different GitHub runners saw a large reduction in local synthetic eight-viewer processing time. However, R18-75 measured the **source first and candidate second**. Repeated function initialization and cache state could have biased its result. The samples were also too small and artificial to justify a production performance claim.

R18-76 addresses that limitation directly without widening the runtime change.

## Reversible local experiment

The existing R18-57 PostgreSQL 17 `BEGIN/ROLLBACK` fixture includes `tests/world-v2-b10-postgres/r76-balanced-cross2-equivalence.sql` immediately **after R18-75's exact source/ACL restore** and **before the original signed R18-57 Commit/collision/rollback tests**. The R18-76 script requires database `world_v2_b10_r05`, role `postgres`, exactly 91 synthetic migration records, eight fixture players, R18-75 reference tables, exact sealed `ray_blocked`, `cross2`, `is_lit` and protected R18-57 frame source digests, and the original private PostgreSQL role restrictions.

The candidate source is generated strictly by replacing **four uniquely anchored** `cross2` invocations in the original PostgreSQL-catalog `pg_get_functiondef`. It keeps the original ray's wall/door/window rules, attribute conditions, epsilon thresholds, operand order, early return and fail-closed exception behavior **verbatim**. The code verifies the original PostgreSQL owner, ACL, security flags, volatility and parallel-safety on every replacement. `cross2` itself is never changed. All `CREATE OR REPLACE` source swaps happen **inside a dedicated SAVEPOINT**, and the exact original source and private ACL must be restored before the unchanged signed movement checks run.

## Expanded private and hostile equivalence

The script reuses 33 existing R18-75 source-real and mixed-light scenes and adds eight strictly synthetic cases: epsilon shifts on either side of a wall, a nearly parallel wall, zero-length geometry, STR-gated wall attributes, a curtained one-way window, invalid points, and invalid coordinates. It uses 32 directed/collinear/near-epsilon rays, three ray modes (vision/light/movement), and four character-attribute combinations.

**Required proof before timing:**

- **15,744 exact original-versus-inlined ray Boolean comparisons** (41 scenes × 32 rays × 3 modes × 4 attribute inputs), including boundary and malformed cases.
- **656 complete private JSONB frame comparisons** (41 scenes × eight fixture viewers × original/fastpath), with complete `visible`, `explored`, metadata and revisions; no lossy checksums or cell-count shortcuts.
- **16 original-vs-inlined private torch+authored-light frames**, explicit revoked-viewer denial, exact original `ray_blocked` digest, `cross2` digest, owner, ACL, eight fixture members, published scene restoration and absent tool-light fixture.

On any mismatch, the disposable PostgreSQL suite **fails closed**, aborting the experiment without displaying scene details or protected frames. The original outer transaction still restores the synthetic world even after suite failure. No production maps or player data are read for these parity tests.

## More balanced performance check

Only after parity succeeds does the same SAVEPOINT measure alternating source and inline implementations in **ABBA then BAAB** sequence:

`source → inline → inline → source → inline → source → source → inline`

Each phase processes three synthetic mixed-light cases: one wall + two lights in ambient darkness, the same in dim ambient, and a closed door + two lights in darkness. One untimed authorized warm-up frame per phase/scenario is excluded from the measurements. Eight complete viewer frames follow each warm-up. Total measured frames are **8 phases × 3 scenes × 8 viewers = 192**, with **four separately measured phases for each implementation per scenario**. PostgreSQL local `pg_stat_xact_user_functions` tracks `ray_blocked` and `cross2` call counts and exclusive self-time. The run prints **only aggregate mean/median/min/max eight-frame elapsed time** and aggregate call counters.

This symmetric within-run ordering addresses—but cannot completely eliminate—noise from compilation, CPU scheduling, cache state, PostgreSQL plan invalidation, profiling overhead and the absence of realistic concurrent players. Underlying function source replacement occurs outside the timed sections and is verified before each phase. No speedup threshold is baked into CI; **correctness and security are hard gates**, performance remains diagnostic.

## Exact-head source-real evidence — 15 November 2026

The first full R18-76 passing run at SHA `2b4d3dddad6f56982f1aaea3878eb701e3cc3ab5` completed all four GitHub workflows: staged Node/Chromium/lint/build/Edge/npm audit (**1,240 tests passed, 0 failed; zero npm production vulnerabilities**, workflow `43604237584`), isolated PostgreSQL movement authority (`43604237675`), disposable source-real PostgreSQL fog/Commit/rollback (`43604237585`) and CodeQL (`43604237602`). The two prior heads were not accepted: the first exposed an overbroad static leak-label matcher, and the source-real run identified a PL/pgSQL fixture-record/table-alias naming collision. Both were **test-harness-only** corrections. No runtime changes or security-test suppressions occurred.

**Source equivalence:** 15,744/15,744 exact original-versus-inlined direct ray outcomes matched across 41 scenes and three ray modes, 656/656 complete private original/fastpath frames matched, 16/16 torch+scene-light private frames matched, revoked viewer remained denied, original ray and `cross2` functions, private ACL, fixture roster and map environment were restored. The original R18-57 signed collision/Commit/recovery/rollback suite subsequently passed within the outer disposable transaction.

**Within-run ABBA+BAAB measurements:** four independently warmed eight-viewer frame sets for **each** variant and synthetic scenario. Times are local, instrumented PostgreSQL 17, NOT remote Supabase, a real multiplayer session or browser p95.

| Synthetic scene | Source mean / median / range (ms) | Inlined mean / median / range (ms) | Observed local mean reduction | Ray calls each | `cross2` calls source → inline |
|---|---|---|---:|---:|---:|
| Wall + two lights, dark | 148.175 / 145.696 / 144.666–156.642 | 60.344 / 60.690 / 58.372–61.623 | **59.3%** | 3,414 | 13,404 → 0 |
| Wall + two lights, dim | 116.105 / 114.334 / 112.943–122.811 | 49.750 / 50.015 / 47.889–51.080 | **57.2%** | 2,611 | 10,192 → 0 |
| Closed door + two lights, dark | 149.577 / 148.175 / 146.815–155.144 | 61.039 / 61.524 / 57.991–63.115 | **59.2%** | 3,414 | 13,404 → 0 |

This more symmetrical order check **supports** that repeated SQL helper calls are costly in this carefully constructed fixture, rather than merely a source-first cache artifact. It is still not an independently randomized multi-run benchmark: four phase samples per condition on a GitHub runner, function replacement between phases, instrumented profiler overhead and synthetic geometry are meaningful limitations. Removing `cross2` *function calls* does not remove geometric calculations or the actual `ray_blocked` invocations; those double-precision cross products now happen within the private ray loop.

**Engineering recommendation:** carry the evidence into a separate, narrowly reviewed **operator-gated reversible candidate design** only after checking deployment rollback/privilege invariants and hostile geometric/source parity on the exact installable candidate. Do not ship the temporary test's dynamically patched function or bypass real-world QA. User-facing movement and observed collision lag are **not yet validated as improved**.

## Exit decision and release rules

Required CI on the **exact final PR head**: Node/Chromium/build/lint/Edge/npm audit, source-real PostgreSQL fog/R57 signed Commit+rollback, independently isolated PostgreSQL World V2 movement authority and CodeQL. An exact original source, owner, ACL, role and fixture-restore gate must pass. Record full CI results and any measurements in the step handoff and Issue #168. PR stays draft/unmerged, chained directly to R18-75.

Even if balanced, source-real local timings still do **not** establish real Supabase Free RAM/locks, production browser end-to-end p95, genuine signed DM/P1/passive-P2 multiplayer visibility/revocation, or actual map workload coverage. In particular, R18-73's live read-only observation of two published maps with one wall and two lights is a **tiny category-only historical sample**, not realistic geometry positions or player movement load.

**Production release: NO-GO** until official authenticated pinned Supabase CLI v2.81.3 exact 83+8 linked migration fetch/list/`db push --dry-run`, independent signed browser QA, browser latency p95, free-tier memory/locks and explicit operator authorization. This step deploys nothing.
