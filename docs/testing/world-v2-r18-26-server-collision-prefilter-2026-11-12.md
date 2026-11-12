# B10-R18-26 — Server-side swept-wall bounding prefilter, exact-authority parity

**12 November 2026, Australia/Melbourne · STAGED ONLY · COMBINED SQL RELEASE NO-GO**

## Source-of-truth baseline

This development stage starts from the **unmerged cumulative R18-24** draft PR #127 head `9a0b726cf6e37251fc0f1b8032db65037a8a2742`. It explicitly excludes the **R18-25 frontend instrumentation**, which was rolled back after the DM reported worse movement. The current live frontend is the R18-24 QA-only canary `7326c45d...` (`dpl_7HUmXi7eQ2oq2Y5HiW6r5Pvzq1HN`), with **83** Supabase registered migrations; frozen R05 `20261111023204` remains **UNAPPLIED**. R18-17, corrected checkpoint-aware R18-19, and R18-20 are also only staged candidates. No PR merge, Supabase migration, Auth changes, or Vercel deployment was made in this stage.

The DM's latest R18-25 256-event trace showed **Advance** p50/p95 239.3/447.5 ms (30), **Commit** p50/p95 1002.4/1133.7 ms (9), **release to terminal** p50/p95 1117.6/1589.9 ms (10), **local collision predictor** p95 0.1 ms (256), and **pointer event handler** p95 0.2 ms (256). There was no observed pin-interception trace. Source inspection supports an architectural server/transport bottleneck but does not isolate each query or link recent performance changes causally.

Read-only, live **pg_stat_statements** accumulated since 9 November reports 1464 normalized top-level Advance calls (mean DB execution 58.30 ms, max 2256.44 ms), 455 Commit calls (mean 213.11 ms, max 3673.67 ms), 539 Begin (mean 24.92 ms), and 1241 signed visibility (mean 43.95 ms). These are *historical database means* and MUST NOT be subtracted from the separate latest browser timings as though temporally matched. Live `track_functions` is `none`; no per-trigger timing can be claimed. The Commit path holds locks, revalidates every approved step, and uses 10 `map_tokens` triggers. Advance also generates recipient-private observer work for eligible campaign members; removing it would risk fog leakage or desynchronization.

## Single deliberately conservative candidate

`supabase/candidates/world_v2_r18_26_step_bbox_prefilter.sql` replaces only the existing **private**, STABLE, SECURITY INVOKER `forge_world_v2.step_allowed(jsonb,jsonb,float8,float8,float8,float8,float8,float8,integer,integer,boolean)`, exact live original definition MD5 `6dcd75ce4719cd0bf6173f77f75fdf32`.

- Same argument order/type, `STABLE` function, schema and search path; **no new public API, privilege, RLS or observer logic**.
- Leaves the original bounds checks, collision-disabled short-circuit, 120-object/80-point validation, wall/portal attribute gates, fail-closed invalid geometry and original `forge_world_v2.swept_hits_segment` SAT call.
- For finite, bounded normal sweep coordinates and segment endpoints only, skips the SAT helper when the entire segment is **strictly separated** from the full token rectangle swept between old/new anchors, with a conservative 0.0001-cell padding margin. A wall near or touching the swept box still undergoes exactly the original SAT check. A malformed JSON coordinate is cast before the skip and cannot silently disappear.
- The planned 0.10-cell edge clearance belongs to R18-17's separate, uninstalled `swept_hits_segment` candidate; R18-26 does **not** change collision tolerance or make walls less solid. Both R18-17 V2 and legacy source use the same swept helper signatures. R18-26 bypass is strictly only a performance short-circuit when the geometry cannot intersect.
- This does **not** remove any sequential network round trips, canonical Commit, viewer-specific private topic checks or role revocation. Expected overall end-to-end benefit is **unproven** and may be modest because browser Commit averages ~1 second.

## Verification design — disposable PG17 only

The existing `tests/world-v2-b10-postgres/rehearse-r18-22.sh` still reconstructs R05 then the three later nonversioned candidates in the isolated third PostgreSQL fixture. R18-26 runs after its O01–O20 assertions.

`tests/world-v2-b10-postgres/step-bbox-r18-26.sql`:

1. Pins the EXACT original live `pg_get_functiondef` MD5; aborts if the source changed. Dynamically clones the original source into an independent `step_allowed_reference_r18_26`, without a permissive stub.
2. Within a disposable transaction, installs the new candidate and compares its TRUE/FALSE/NULL output against original for **4,860 deterministic cases** spanning walls, open and closed doors, attribute gates, token spans 1/2/4, cardinality errors, edge and diagonal movement, clear and far-away walls, and near-barrier corner sweeps.
3. Exercises deliberately malformed coordinates, map bounds, collision-off semantics, wall clearance and unchanged private `anon`/`authenticated` SQL access.
4. Times 40 calls over 100 distant barriers for original and candidate, reporting raw local PostgreSQL milliseconds as **advisory only**. These samples cannot prove live RTT improvement; CI performance noise is high.
5. Rolls the entire function replacement and synthetic tests back. A final check compares the restored original full body MD5 and ensures the reference function is absent. No source remains installed from R18-26.

`tests/world-v2-r18-26-step-prefilter-security.test.mjs` pins the frozen R05 and 3 candidate Git blobs, checks only the private STABLE function is replaced with conservative guards, verifies single in-order PG fixture integration and confirmed ROLLBACK, and rejects unexpected DML/DDL/permissions.

**If any parity test fails, reject the optimization outright.** No performance gain is worth a changed collision or authorization decision.

## Incomplete security and deployment gates

- The live database has NOT been migrated and should **not** be modified using Supabase direct `execute_sql` for this candidate.
- Existing authenticated CLI v2.81.3 linked 83-body fetch, exact R05-only dry-run, signed recovery preflight and separate R05 authorization are still pending.
- R18-17, corrected R18-19 and R18-20 need later versioned migrations **only after R05 is independently approved and installed**. R18-26 is an additional unversioned candidate, not a fourth migration number.
- Real separate signed DM/Player 1/passive Player 2 fog/LOS/private Realtime/revocation tests are still pending; a synthetic PG role, local DM preview, or self-labeled QA report cannot clear them.
- Vercel live frontend should remain on R18-24; the rolled-back R18-25 instrumentation is excluded from this cumulative branch. Do NOT enable guarded 700ms recovery or relax collision.

**Decision:** Stage and test narrow server-side work now; **no production SQL or frontend deploy** until authenticated migration and independent-player gates. Follow a confirmed candidate performance result with broader isolated adversarial tests and a new explicit release review. R18-26 alone is not an adequate cure for observed ~1 s commit latency.

## Completed source-level validation — exact SQL commit `b4fd6e0b`

The first B10 combined SQL workflow detected a **test harness error**, not a geometry failure: the original-function reference `regprocedure` in a newly written SELECT listed only five double-precision arguments instead of the real function's six. The R26-01 source hash gate passed before this error. The typo was corrected without changing candidate SQL or frozen migrations, and the full combined PostgreSQL workflow then passed at exact source commit `b4fd6e0b69f8c3b0f8ca86fa71de837c670f6c71`.

- Full isolated combined PostgreSQL 17 #43157643591: **SUCCESS**, original R18-22 **O01–O20** all pass; R18-26 exact live baseline source pinned; **4,860/4,860** reference-versus-candidate collision cases match; **13/13** R26 gates pass. Invalid wall coordinate still raises the same PostgreSQL SQLSTATE. Original function and reference both restored/removed after transaction rollback. No live SQL executed.
- Isolated benchmark: 40 repeated permitted moves through a synthetic scene with 100 remote barriers take **26.50 ms** with the original and **9.91 ms** with the conservative prefilter. This is a **62.6% reduction in the time for this particular 40-call microbenchmark**, not a measured production Commit or browser latency gain. It does not predict how much of the ~1 s Commit RTT will disappear.
- Staged frontend Node verification #43157649678: **1,015/1,015 tests**, Vite production build and audit passed. Isolated PostgreSQL authority #43157649747: **PASS**. CodeQL #43157649650: **PASS**.

**Decision unchanged:** the candidate is worthy of further review as a post-R05 opt-in server performance change, but **no migration version, production deployment, merge, or release authorization** follows from the benchmark. Testers are not required for this isolated SQL test; they remain required before full fog/private observer acceptance.
