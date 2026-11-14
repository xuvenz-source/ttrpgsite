# Tabletop Forge — B10-R18-55 transactional dirty-fog prototype: full cost and security findings

**13 November 2026, Melbourne · Draft/staging only · NOT A RELEASE CANDIDATE · NO-GO.**

## Exact parent, architecture and scope

Parent: R18-54 PR #158, exact SHA `2de5bfdb08d466282078772ec2fd98835f241b1b`. R18-55 PR #159 adds test-only `r55-dirty-fog-candidate.sql`, rollback-only source-real `r55-dirty-fog-prototype.sql` and static Node adversarial checks. It modifies the disposable R05 runner and the existing R54 PG17 workflow path filter, but **no active Supabase migration, original R05, runtime client code, R18-43 flags, DDL on production, public RPC or browser grants**.

The original R54 source-extracted **13 digest-pinned production functions** and authentic `forge_player_collision` and `forge_visibility_token_tick` triggers remain the baseline. The original actor-bound Begin/Advance/Commit and private viewer source calculations run unchanged. The candidate only renames the private `bump_viewer_ticks` function in the disposable database and installs a narrower experimental version under the original function name.

## Prototype mechanism and why it is not deployable

1. Canonical token Commit still validates its server-signed path and wall, and the real token trigger still chooses affected viewers. The candidate writes monotonic, recipient-scoped `map_viewer_visibility_ticks.revision` dirty updates **inside the same transaction**, sets `authorized_frame=NULL` and scrubs the recipient's private `viewer_fog_snapshots.frame` to an empty JSON object. It does not compute rays, light or new explored cells in that Commit.
2. The **test-only private** `r55_try_authorized_frame(map)` derives the user strictly from `auth.uid()` (no arbitrary recipient ID). It returns a cached frame only if the caller is an authenticated active player on that map, the private tick exists with a non-null authorized frame, its own revision matches the returned signed revision, and its permission-generation and published-environment revision both match current database values. Otherwise it returns NULL. Exceptions fail closed.
3. The **test-only private** `r55_refresh_for_caller(map)` repeats live membership and map checks, acquires the original per-recipient transaction advisory lock, calls the unchanged original full fog updater for only that recipient if dirty, and validates the final frame with the same guard. Duplicate refreshes return the same frame without new database publication.

Both experimental functions have `EXECUTE` revoked for `PUBLIC`, `anon` and `authenticated`; the client cannot invoke them. **No browser / signed Realtime protocol is integrated.** A NULL authorized_frame must be interpreted as immediate vision invalidation by a future client rather than as an empty map to flash. Moreover an already-delivered signed old packet and private Realtime channel state can be observed in a different network ordering. Supabase's Realtime authorization notes channel permissions can remain cached until token renewal or reconnection: https://supabase.com/docs/guides/realtime/authorization. This experiment does not prove immediate revocation of such packets. No approval for production use, background workers or an asynchronous queue.

## Actual disposable PostgreSQL 17 acceptance

All fixture work runs under `BEGIN; ... ROLLBACK;` in localhost `world_v2_b10_r05` with ephemeral `postgres:17`; the source-snapshot file also has a direct-execution local-db guard. Each full/candidate group executes eight real one-cell actor-bound Begin/Advance/Commit operations, then reverses the token using the real RPCs rather than direct table movement. Fourteen or more security conditions per iteration assert: two audience-specific signed frames, dirty tick revision increments, no cached frame before a refresh, second legal move while still dirty, idempotent same-viewer retry, independent authorized second viewer, foreign user denial, and current canonical x/y. Extra adversarial cases assert a source-real wall denies crossing without leaking geometry, spectator revocation blocks private reads, and changes to token navigation permission generation or published map environment revision invalidate prior signed cached frames. Postrollback assertions confirm all experimental objects and canonical tokens/sessions restored. The preserved R05 migration and recovery rehearsal passes afterward.

## Measured costs — SQL-only and low sample size

Two independent successful local executions; one original-full phase then one dirty-only phase, with **n=8 per phase**. Order and warm-cache effects are confounded, and the R54 physical fixture tables are simplified; there is no browser, network RTT or independently signed P1/P2 session. Deferred cost is the sum of separately timed P1 and P2 source-real refreshes; these are **not additional time measured inside Commit**.

| Successful isolated job | Original Commit median (ms) | Dirty Commit median (ms) | Original mean total DB work (ms) | Dirty mean Commit + both viewer refreshes (ms) |
|---|---:|---:|---:|---:|
| 131808535016 | 16.224 | 1.827 | 17.664 | 17.686 (Commit 1.992 + refreshes 15.695) |
| 131810612846 | 16.822 | 1.929 | 18.327 | 17.918 (Commit 2.101 + refreshes 15.816) |

These results show an ~**88–89% reduction in local median Commit cost**, but **no convincing reduction in total database work** when both recipients need their updated sight. As a consequence the change may improve canonical token acknowledgement latency but also introduces at least one viewer-refresh round trip, intermediate vision invalidation and new staleness/revocation ordering risks. It is not a validated improvement to perceived movement and cannot resolve the much larger historical browser Commit p95 or persistent Advance RPC serialization by itself.

## Failures and engineering corrections

Initial experiment in job `131807372675` passed all signed movement, dirty-frame, private-auth, revoke, wall and rollback assertions, but only timed Commit. A follow-up run added explicit two-viewer refresh timing. The first generation/environment-safety extension failed at SQL parse time in job `131809876632` because a string-template substitution accidentally duplicated and truncated a regex literal in **test-only SQL**. The experimental file was restored from its original reviewed SHA and reassembled with literal-safe replacement; exact SQL execution and new safety cases passed in job `131810612846`. No production code or database was involved. All failing runs remain visible in GitHub CI; none was marked passed.

## Decision and next work package

**R18-55 experiment: ENGINEERING PASS; RELEASE NO-GO.** Do not promote the dirty-marker SQL or enable the existing atomic flags. A future release-grade design must prove native browser sealing/recovery ordering across private Realtime, current server-side membership and RLS, disconnect/reconnect, simultaneous commit/refresh and mid-flight revocation with genuine signed independent DM/P1/passive-P2 sessions, including a measured improvement in actual user-perceived latency. A light-weight optimization which preserves synchronous signed per-recipient sight and reduces repeated expensive visibility computations may be preferable and should be investigated next in source-real isolated PostgreSQL 17 before adding async complexity.

Still missing: genuine authenticated pinned Supabase CLI isolated **83 applied + eight reviewed pending** fetch/list/db push `--dry-run`, independent DM/P1/passive-P2 fog/LOS/observer/revocation/canonical QA, current free-tier RAM/locks and browser RTT testing, and explicit release approval. The production Vercel R18-35 and the 83 applied Supabase migrations must remain unchanged; R18-26/27 mixed performance candidates and rejected R18-40 client patch stay excluded.