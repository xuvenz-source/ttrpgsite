# PR #53 live-testing rollout record — 2026-11-08

Designer-approved one-release movement/fog/Realtime/memory architectural attempt. Production frontend still on PR #52 while SQL preflight completes.

## Installed SQL (Supabase Free)
- 20261108111759 — unified_movement_fog_realtime_memory_20261108 (lighting v2, private cached observer path, motion sessions and per-viewer fog deltas)
- 20261108112135 — fix_motion_session_record_alias_20261108 (PL/pgSQL record/table alias ambiguity)
- 20261108112252 — guard_stationary_motion_collision_20261108 (zero-distance wall sweep)
- 20261108112544 — fix_motion_step_count_builtin_20261108 (unqualified PostgreSQL GREATEST)

All four version numbers are recorded in production migration history; repository migration files match. The initial attempt with reserved variable name `by` failed atomically and was corrected before applying 20261108111759.

## Verified prior to frontend merge
- Grant/RLS: anon has no EXECUTE on new public endpoints; authenticated has EXECUTE only on the four public wrappers and lighting RPC; private SQL helpers are non-callable to app roles; private motion and fog snapshot tables are RLS-enabled with no direct app table read/write.
- Server smoke: signed-in test-campaign identity accepts authorized full fog delta and v2 lighting; begin/end motion work; unknown session is denied; zero-distance valid sample and a nonzero adjacent motion segment are accepted. All sample movement sessions occurred in rolled-back transactions to avoid campaign data changes.
- GitHub staged test/build/Deno/dependency audit and CodeQL must pass on final PR head.

## Merge/deploy verification
- Merge PR #53 once after the latest CI and CodeQL succeed; GitHub-linked Vercel automatically builds main.
- Verify deployment is READY, production target and Git SHA equals new main merge. Check account sign-in, map loading, player movement, collision, fog, held lights, hidden NPC reveal, multipiece moves, reconnect, and simultaneous viewers.
- Existing test campaigns are the only available end-to-end environment. Physical RAM/swap, committed memory and p50/p95 movement latency remain live stress-test observations, not claims of proven improvement.

## Rollback
Restore the frontend to last verified PR #52 Vercel deployment first. Only after old frontend is proven healthy consider dropping v2 SQL using the staged rollback scripts. Preserve the old legacy RPCs and campaign tables.
