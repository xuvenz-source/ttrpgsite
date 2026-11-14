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

## Exit decision and release rules

Required CI on the **exact final PR head**: Node/Chromium/build/lint/Edge/npm audit, source-real PostgreSQL fog/R57 signed Commit+rollback, independently isolated PostgreSQL World V2 movement authority and CodeQL. An exact original source, owner, ACL, role and fixture-restore gate must pass. Record full CI results and any measurements in the step handoff and Issue #168. PR stays draft/unmerged, chained directly to R18-75.

Even if balanced, source-real local timings still do **not** establish real Supabase Free RAM/locks, production browser end-to-end p95, genuine signed DM/P1/passive-P2 multiplayer visibility/revocation, or actual map workload coverage. In particular, R18-73's live read-only observation of two published maps with one wall and two lights is a **tiny category-only historical sample**, not realistic geometry positions or player movement load.

**Production release: NO-GO** until official authenticated pinned Supabase CLI v2.81.3 exact 83+8 linked migration fetch/list/`db push --dry-run`, independent signed browser QA, browser latency p95, free-tier memory/locks and explicit operator authorization. This step deploys nothing.
