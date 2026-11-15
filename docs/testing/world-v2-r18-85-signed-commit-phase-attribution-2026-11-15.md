# B10-R18-85 — Fully signed Commit-vs-Advance phase isolation

**15 November 2026 (Australia/Melbourne). DRAFT, disposable PostgreSQL 17 testing ONLY. NO DEPLOY / SQL APPLY / MERGE.**

Exact parent PR #186 R18-84 SHA `76a66177a834acfc54afce4f3731d8442df3c953`. Draft PR #187 contains separate test-only measurements and preserved release-gate records. This does not alter gameplay, front-end code, movement protocol, public SQL functions, fog/collision triggers, RLS/grants, migrations, Vercel deployment or Supabase settings.

## Problem being isolated

In an actual signed-in solo-DM preview run, movement remained **unacceptable around solid walls and under fast input**, with browser Advance p95 **740.1 ms**, Commit p95 **1451.7 ms**, and terminal release-to-finish p95 **2226.1 ms**. These are observations from the older preview, not verified measurements of later R18-82 source changes. We must not infer network RTT from local SQL calls or mark movement accepted.

R18-83/84 source-real local PG17 profiling confirmed many fog ray checks, but the R18-84 aggregate covered **Begin + Advance + 72 forward/reverse signed Commits**, fog frame warm-up, environment setup and other operations. Its `pg_stat_xact_user_functions` inclusive times overlap ancestors and children. No per-original-Commit causal breakdown was established.

## R18-85 engineering scope

Keep the original R18-83 first and R18-84 second disposable R54 runs unchanged. Add a **third opt-in R54 pass** via `psql -v r84_full=1 -v r85_phase=1`. It installs the existing R84 six source-exact token and four source-exact tool position UPDATE trigger paths only inside R54 `BEGIN/ROLLBACK`. It runs the original 72 canonical token Commits and eight canonical tool Commits with all hostile checks as before; then invokes `r85-signed-commit-phase-attribution.sql` to measure four additional ordinary signed motion sessions (two forward, two return).

The R85 probe runs one fog-enabled and one fog-disabled **24 off-route wall** case, each starting and finishing at the same canonical token coordinate. This is **n=1 measured original forward Begin+Advance and Commit per mode**, not a statistically meaningful latency distribution. Original `public.begin_world_motion_v2`, `public.advance_world_motion_v2`, `public.commit_world_motion_v2` bodies and full trigger wiring are unchanged and digest guarded. The test samples actual transaction-local `pg_stat_xact_user_functions` before/after Begin+Advance and then before/after the separate Commit, recording only function name, call count, inclusive and self time, alongside elapsed local request time. It asserts no Commit occurs during Begin+Advance, all six token triggers fire on Commit, fog-enabled Commit refreshes the authorized private viewers and fog-disabled Commit does not. The source-real wall collision checks, tool mapping/permissions and mid-session fog revocation are retained independently.

**Rate guard:** R54/R68/R84 use 115 actor gestures within the original 120-per-60s cap; R85 rejects unexpected counts and adds only four, reaching at most 119. No rate/connection limit is relaxed. Any preflight/SQL error fails the isolated PostgreSQL CI job. The outer R54 post-`ROLLBACK` check rejects residual phase tables, R84 fog functions, sessions or moved canonical positions. The shell guard refuses non-local DSNs or user-supplied DB credentials. Linked Supabase remains `track_functions=none`.

## Expected actionable information, not permission to deploy

The important question is whether the synchronous **private viewer visibility frame** and its `ray_blocked`/`is_lit` descendants are observed solely during canonical Commit, rather than the Begin+Advance stage, **within the same source-original signed session**. A positive result prioritizes verifying the existing separately gated R18-57 fog fastpath and/or the R18-77 source-sealed ray calculation candidate against production-equivalent private sight/hostile parity. It does **not** justify postponing authorized sight to after acknowledgement, disabling collision, skipping revocation, removing route revalidation, bypassing RLS or turning on unverified background job queues. The R18-77 SQL remains opt-in, unversioned and **not installed**, with required 83+8 history, operator gate and rollback.

The full production trigger *functions* are represented, but R84's small source-real fixture still has simplified table schemas and a test-only observer sink, not complete live role/RLS/Realtime/three-browser parity. Performance from instrumented local PG17 is not Supabase Free p95 or browser latency; four additional signed sessions do not demonstrate load stability. The R18-84 original two-trigger vs expanded six-trigger mean differences could also be due to run order, warm cache and instrumentation; do not present them as a proved exact penalty for four validation triggers.

**Release decision: NO-GO.** Mandatory outstanding gates: authenticated pinned official Supabase CLI 2.81.3 83 historical + eight reviewed pending migration fetch/list/`db push --dry-run`; independent signed DM/P1/passive P2 tests of true wall collision, rapid corner regrab, synced canonical token positions, observer fog/hidden geometry and revocation; browser p50/p95 under concurrent input; physical Free-tier RAM/swap/locks; and explicit operator approval. No protected QA or canonical production alias changes in R18-85.

## Final verification checklist

Record the exact PR #187 head SHA and direct R18-84 parent, ahead/behind and touched paths. Four exact-head checks required: all Node tests, build/lint/npm audit; isolated authority PG17; local PG17 source-real R54/R83/R84/R85 rollbacks and fog/permission/collision; CodeQL. If the phase test cannot attribute calls reliably using transaction-local snapshots, record it as engineering BLOCKED rather than manufacture a number or weaken assertions. Retarget draft PR directly to R18-84 after exact-head CI. Update Issue #168 with measured **synthetic-only** function cost deltas and explicit release NO-GO.
