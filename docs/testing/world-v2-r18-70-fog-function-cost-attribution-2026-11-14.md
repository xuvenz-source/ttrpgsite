# B10-R18-70 — Attribute remaining eight-viewer fog cost to ray or lighting functions

**14 November 2026 · Source-only test stage · no production deployment, no SQL migration or permission change.**

## Why this step

The R18-67 live Supabase historical `authenticated` Commit mean of about **292 ms** and the R18-68 source-real PG17 fog-on/off comparison demonstrate a potentially expensive synchronous visibility update. R18-69 then confirmed **72/72** original-vs-R18-57 complete private fog frames across eight simulated viewers and nine hostile/shared/dark scene states. The unchanged original R18-57 eight-viewer benchmark measured **314.576 → 175.432 ms** mean Commit for a wall-heavy map (four local samples each), still potentially slow.

The source indicates two candidates for the remaining wall-heavy work: `forge_visibility.ray_blocked` scans the scene wall/door/window JSON (up to 120 objects, 80 points each) when checking line-of-sight; `forge_visibility.is_lit` evaluates ambient/light sources and can invoke further ray tests. Both are called from the protected frame function. We should **measure**, not guess or loosen private visibility/geometry semantics.

## New disposable PostgreSQL test

`tests/world-v2-b10-postgres/r70-fog-function-cost-profile.sql` runs inside R18-57's already open **BEGIN/ROLLBACK** fixture, after the sealed optimized candidate and R18-69's 72 parity checks, before the original R18-57 signed movement benchmark and rollback. It requires exact test database and role, all 91 synthetic migration records, a pinned fastpath source digest, the original alias and unchanged private grants/schema USAGE. Nothing in `supabase/migrations`, `supabase/candidates`, gameplay runtime, Vercel or Supabase is modified.

The test sets `SET LOCAL track_functions='all'` **only in disposable PostgreSQL 17**, and reads `pg_stat_xact_user_functions`, which counts functions executed within the current transaction. PostgreSQL documents `calls`, `total_time`, and `self_time`; the source records only delta **calls** and **self-time milliseconds** for the two original private functions `ray_blocked` and `is_lit`, plus aggregate elapsed wall time across eight fixture viewer frames. It then restores `SET LOCAL track_functions='none'` before all subsequent R18-57 benchmarks. Because instrumentation changes runtime overhead, do not compare the instrumented frame elapsed times to earlier untracked Commit numbers.

The profile runs **2 repetitions × 2 scenes × 2 variants = 8 records**. Each record is exactly eight complete authorized viewer frames, original or fastpath. Original/fastpath order flips on the second repetition to reduce order bias, and the original scene and fixture roster are restored. The sample deliberately avoids any real session credentials or live-user IDs in logged results.

The report prints only `scenario`, `variant`, `iterations`, `viewers_per_iteration`, mean aggregate frame elapsed milliseconds, mean `ray_blocked` calls/self time and mean `is_lit` calls/self time. It does not output SQL source, private fog cells, token or player IDs, map geometry, signing keys or session data.

## Interpretation

- If the ray function's self time and call counts dominate **wall-heavy fastpath**, a subsequent candidate can investigate reusing *validated* wall geometry or per-frame visibility calculations while preserving authored wall/door/window state and per-viewer conditional wall rules. A geometry cache would need strict invalidation on DM scene edits, permission changes and token/light movement. Never trust an unauthenticated or stale ray cache for private sight.
- If `is_lit` dominates, target documented source-safe ambient and torch checks while verifying original full-frame parity under darkness, open/closed portals, malformed scene objects and revocation. Do not turn insufficient light into visibility by default.
- If neither dominates, measure other per-viewer exploration writes, row updates or observer processing rather than editing these functions speculatively.
- These are **source-real local fixture samples**, not user-experienced browser RTT, production p95, peak Supabase Free RAM/locks or independently signed DM/P1/P2 acceptance.

R18-70 must pass all **four** exact-commit CI workflows: Node/Chromium build/lint/audit/Edge, isolated PostgreSQL authority, source-real R54–R57 fog/rollback (including R18-69), and CodeQL. Any failure is an engineering blocker. Existing deliberate drift/authorization negative tests are expected to reject dangerous operations.

**Release remains NO-GO.** The official authenticated Supabase CLI v2.81.3 exact 83+8 linked history/list/`db push --dry-run`, separately approved installation, three genuine independent-browser multiplayer test, private fog revocation, canonical movement, browser RPC latency and Supabase Free memory acceptance remain outstanding. The project administrator has already confirmed Google preview OAuth PASS; no repeat needed.

PostgreSQL reference: https://www.postgresql.org/docs/17/monitoring-stats.html and https://www.postgresql.org/docs/17/runtime-config-statistics.html.
