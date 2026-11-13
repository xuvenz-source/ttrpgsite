# Tabletop Forge — B10-R18-54 source-real fog-on/off Commit benchmark

**13 November 2026 (Australia/Melbourne). Staging only. NO production deployment or database mutation.**

## Exact scope and source provenance

Parent R18-53 draft PR #157 exact SHA `c1523fabca8fc995f4efa5d4ca0c7af53fba35dd`. R18-54 adds a disposable PostgreSQL 17 benchmark, original function source capture, strict source-hash checks, a dedicated no-secrets CI workflow, and Node tests. It modifies only the existing pre-R05 **test runner** to invoke the R54 fixture before the preserved R05 migration rehearsal. It does **not** edit production runtime, active migrations, R18-48 eight pending SQL sources, R18-43 flags or Vercel.

The 13 functions in `tests/world-v2-b10-postgres/r54-live-fog-function-sources.sql` were captured with a privileged **read-only** `pg_get_functiondef()` query on the healthy 83-migration live Supabase baseline, then the retrieved MD5s were compared against previously reviewed source hashes or separately verified current catalog hashes. Every original function definition is included unchanged, with exact source identity rechecked in local PostgreSQL 17 **after loading**. They include `authorized_viewer_fog_frame`, `bump_viewer_ticks`, `fog_cells_diff`, `viewers_affected_by_token_move`, `is_lit`, `ray_blocked`, `tick_tokens`, `enforce_collision`, and `commit_allows_piece_v2` and their dependencies.

The physical fixture tables are **minimal test-only structures**, not complete copies of production RLS, indices, permissions or distributed Realtime. The pre-existing B04 test-only observer broadcaster is still a sink; no claim is made of independently authenticated P1/P2 or complete live fog privacy. Those limits deliberately block release approval.

## Fixture and test method

1. Dedicated PR-triggered GitHub Actions job creates PostgreSQL 17 in Docker with only local `127.0.0.1:5432`, synthetic `anon`/`authenticated` roles and `WORLD_V2_B10_ISOLATED=yes`. It creates the isolated database `world_v2_b10_r05`, using the existing frozen baseline Begin/Advance/Commit sources.
2. The fixture checks the database name and clean starting token, opens `BEGIN`, builds minimal rows for fog snapshots, exploration, preview and viewer ticks, loads all 13 exact sources, verifies every `pg_get_functiondef` digest, and installs the **original** real collision and visibility token triggers only inside the transaction.
3. A source-real per-viewer fog frame is generated for the two synthetic players; their `visible` arrays must be different and nonempty. The exercise then runs eight alternated paired one-cell movements with fog enabled versus disabled. Every sample performs genuine actor-bound Begin/Advance/Commit, verifies the authorized endpoint and actual canonical token x/y, checks private viewer tick revision increments for fog-on only, and returns home via another signed Begin/Advance/Commit.
4. After timing, a solid source-real wall must block a new unauthorized crossing with zero accepted cells, no client-returned wall geometry and the same canonical position. Revoking the second synthetic member must make its fresh authorized fog-frame request fail.
5. The whole fixture `ROLLBACK`s. A subsequent independent statement asserts removal of all added fog definitions/triggers, exact original token position and no lingering motion sessions. The existing R05 versioned migration and recovery rehearsal then runs and must pass untouched.

## Actual successful CI measurements

These are **local one-database SQL execution durations** around `public.commit_world_motion_v2`, not Chrome RTT or PostgreSQL production overhead. Eight samples per condition per run; the same source-exact code, two fixture viewers, 16 signed canonical Commit samples per run. No artificial sleeps. P95 from n=8 should not be taken as a stable performance service-level objective.

| Independent job | Mode | n | Mean ms | p50 ms | p95 ms | Max ms | Minimum viewer revision delta |
|---|---|---:|---:|---:|---:|---:|---:|
| 131732432169 | Fog off | 8 | 0.940 | 0.821 | 1.362 | 1.393 | 0 |
| 131732432169 | Fog on | 8 | 13.831 | 12.784 | 18.175 | 20.651 | 2 |
| 131733476209 | Fog off | 8 | 0.690 | 0.567 | 1.067 | 1.095 | 0 |
| 131733476209 | Fog on | 8 | 10.692 | 9.865 | 13.936 | 15.876 | 2 |

The paired **median increase is ~11.96 ms in the first job and ~9.30 ms in the second**, approximately **15.6x and 17.4x**, respectively. In both runs the real canonical token/visibility triggers demonstrably add work; both affected private viewer revision rows advanced while fog was on, not while off. The second job additionally certified wall denial/no-hidden-geometry, recipient revocation and complete rollback. This isolates the existence and magnitude of fog-associated overhead in the simplified fixture; it does not establish how much of production's historical Commit mean ~292 ms, maximum 3.67 s, or user's ~1.3 s p95 browser Commits is caused by these specific functions. Production `track_functions=none` and real services include further SQL rows, locks, network and client terminal reconciliation.

## Safety findings and recommended next stage

No `ALTER`/`CREATE`/`INSERT`/`UPDATE`/`DELETE` was performed on live Supabase. Original server authority, user grants, hidden-wall geometry, observer fan-out, private signed per-viewer sight and canonical route validation remain untouched in production. The benchmark does not use direct `UPDATE public.map_tokens` to simulate movement; all token changes go through the original authenticated RPCs, with accepted-path and checkpoint guards.

**R18-54 release verdict: NO-GO.** The evidence justifies investigating fog recomputation as a bounded optimization candidate, not blindly moving it asynchronously. A safe R18-55 candidate would have to preserve immediate server-side authorization invalidation, map/permission revision ordering, recipient privacy, canonical position and replay/role revocation safety. First prototype in a separate disposable source-real fixture; compare before/after signed visibility and hostile auth cases. A background queue that releases a private frame before rechecking its recipient is forbidden. Other production bottlenecks remain: sequential Advance RTT, real trigger/lock pressure and UI regrab waits.

Still outstanding: **actual authenticated official Supabase CLI 2.81.3 isolated 83+8 fetch/list/db push --dry-run**, genuine signed independent DM/P1/passive-P2 fog/LOS/revocation/convergence testing, live free-tier RAM/CPU/lock/browser p50/p95, and explicit production release authorization. Do not deploy or enable atomic flags; retain R18-35 production fallback and intentionally exclude R18-26/27 mixed candidates and rejected R18-40 frontend.

## CI provenance / limitations

Initial CI workflow job 131732189230 failed during Docker *container setup* because the composed `--health-cmd` was improperly quoted; the workflow was repaired without touching SQL. Follow-up job 131732432169 executed all source-real checks and R05 rollback successfully. After adding the wall denial assertion, job 131733476209 again executed the full fixture successfully, with different (n=8) timings shown above. Exact-head Node tests, PostgreSQL authority, dependency audit, build, Edge type checks and CodeQL must still be verified at the final report commit before retargeting draft PR #158 to the exact R18-53 staging parent. Neither test job has contacted live Supabase.