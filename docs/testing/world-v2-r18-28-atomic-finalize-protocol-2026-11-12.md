# B10-R18-28 — Atomic last Advance + canonical Commit experiment

**12 November 2026 · Australia/Melbourne · staging-only, production SQL and frontend NO-GO**

## Scope and source of truth

Parent draft PR #131, exact staged head `4947e33a34e124e4584424a0b67b1b8199f72c69`. This stage extends the cumulative World V2 post-R05 staging work. Deployed frontend stays at rolled-back **R18-24** Vercel `dpl_7HUmXi7eQ2oq2Y5HiW6r5Pvzq1HN`. Supabase still has **83** registered migrations, frozen R05 `20261111023204` remains **unapplied**. R18-17 wall leeway, corrected R18-19 cross-map guards, R18-20 campaign affinity, R18-26 collision prefilter and R18-27 Commit empty-work gates are **unversioned candidates**. R18-25 frontend instrumentation remains rolled back and is excluded.

User-observed lag: latest captured browser Advance p95 ~447.5ms (30 samples), Commit p95 ~1133.7ms (9), release-to-terminal ~1589.9ms (10). Historical Supabase `pg_stat_statements` samples (not same timed requests) show Advance ~58ms and Commit ~213ms mean execution. The database is in AWS `ap-northeast-1`, so geographically distant round trips are a plausible contribution but **are not independently isolated**. R18-26 and R18-27 reduce backend work; neither removes a client HTTP request.

## R18-28 architectural improvement (candidate only)

Introduce **one optional new public authenticated RPC** `public.finalize_world_motion_v2(session,seq,from,targets,environmentRevision,permissionGeneration)` that calls the **existing original server-authorized** Advance and Commit RPCs inside *one PostgreSQL transaction*, instead of requiring the client to await two separate HTTP round trips for its final motion batch.

`supabase/candidates/world_v2_r18_28_atomic_finalize.sql` adds exactly two private nullable `jsonb` receipt fields to `forge_world_v2.motion_sessions` and the new public function. Nothing else. The original Begin/Advance/Commit API, private observer queue, source-backed collision and actor-selected row locks remain unchanged.

- **Authorization and input binding:** `auth.uid()` is mandatory, the caller's own session row is locked `FOR UPDATE`, active non-preview sessions and existing `session_valid` are required; current scene and permission revisions are not relaxed. Final targets retain the old 8-target ceiling, expected sequence, exact frozen session origin and original full sweep collision.
- **Source-authoritative endpoint:** The new function calls `public.advance_world_motion_v2` first. Its **accepted** server-approved route is the only source of the final endpoint. It calls `public.commit_world_motion_v2` with that endpoint, ensuring all current locks, session reauthorization, full accepted-leg collision replay, trusted transaction checkpoint, token/tool triggers, and private terminal observer drain still run.
- **Atomic rejection:** NULL Advance, empty accepted prefix, bad response, failed Commit or failure to store the exact receipt raises one deliberate SQLSTATE inside an inner exception subtransaction. It rolls back the entire new Advance/Commit state, including any tentative recipient-private Realtime outbox entries or checkpoint. Unhandled database errors also abort the outer transaction. There is **no partially committed token after a NULL response**.
- **Collision prefix:** A partly blocked route can commit **only the accepted server-confirmed prefix**, returning `blocked:true` and the exact endpoint. A wholly blocked final batch returns NULL, leaving the session unchanged; future client integration must treat this as failed finalization, not fabricate an accepted step.
- **Exact retry:** The new private session fields record the full `seq/from/targets/environmentRevision/permissionGeneration` request and combined final reply. An identical replay on a committed session calls the **original Commit retry** to recheck current map access, scene, permission generation and private deferred hides; changed or revoked requests are rejected. Existing Commit `last_reply` and B08 idempotency state are untouched.
- **Security:** The new function is `SECURITY DEFINER` for the same tightly actor-bound reason as the existing two public V2 RPCs. It is explicitly revoked from `PUBLIC` and `anon`, grants EXECUTE only to `authenticated`, and adds **no** private schema/table client grants, RLS policies, Realtime topics, direct token write endpoint, or hidden fog payload in its reply.
- **Resource limits:** It adds no long-running tasks, polling, Realtime subscriptions, paid components or indexes. Two bounded final receipt fields are held only as long as the session table's existing cleanup lifecycle; actual memory benefit/cost requires later production validation.

## Explicit non-goals and protocol compatibility

This stage **does not modify the frontend**. The live browser continues to use the existing Begin/Advance/Commit and can never call the new RPC. The candidate therefore provides **zero** current production latency improvement. It establishes the server half of a prospective one-fewer-round-trip release.

A subsequent separately staged client package must check that an in-flight gesture is closing, that remaining targets are within existing 8-target/24-cell limits, and that the final RPC is available **only after versioned SQL installation**. It must validate `version/sessionId/seq/commitSeq/blocked/accepted/endpoint/finalized` against the client's expected route; never use a speculative position or assume a timeout means success; tolerate lost replies through exact replay; preserve older servers through an explicit disabled-by-default rollout with no blind retry/fallback after uncertain commit. A blocked-only final NULL must fail closed and renew authority before further action. The client cannot send future route commands until previous authorization is resolved.

R18-28 should not be deployed as a standalone SQL migration, hidden behind automatic PostgREST RPC discovery, or mixed with the not-yet-installed R05 package. Full audit of a new public SECURITY DEFINER surface is mandatory before a versioned release.

## Disposable PostgreSQL proof

The existing safe `tests/world-v2-b10-postgres/rehearse-r18-22.sh` runs only with `WORLD_V2_B10_ISOLATED=yes`, local PGHOST/fixture database and no external DB URL overrides. The new `atomic-finalize-r18-28.sql` executes **after** installing R05, R18-17/19/20 and after the R18-26/27 rollback-only overlays.

The isolated suite creates the two fields/new RPC in a transaction, tests signed actor-owned token Begin/Advance/Commit, cross-actor denial, exact final ACK retry, denial of changed origin/targets/revisions, 2x2 mounted tool update, certified private hide queue and no stale published path, blocked partial prefix versus completely blocked attempt, permission-generation revocation of cached reply, and a deliberately failing actual token UPDATE trigger to verify rollback of the combined Advance and observer outbox. It checks no anon execute, no direct client private session access, and final **ROLLBACK** removing the new API and columns.

`tests/world-v2-r18-28-atomic-finalize-contract.test.mjs` pins six prior SQL Git blobs including frozen R05, rejects unauthorized schema/grant changes, checks the exact two-phase source call order and fail-closed retry, and proves **no frontend module invokes this candidate yet**.

The B07 fixture uses simulated observer visibility; it demonstrates private message handling at the SQL level, **not** independently signed real DM/P1/passive-P2 LOS/fog/revocation or network throughput. Ordinary synthetic timing in local PG is not production browser RTT evidence.

## Release decision / next bounded step

**NO-GO** for production SQL, frontend or main merge until operator-authenticated Supabase CLI v2.81.3 (83-body reconciliation, true R05-only linked dry run), separately approved R05 and later versioned packages, and independent real DM/P1/passive-P2 fog/Realtime/movement acceptance are complete. The default guarded 700ms recovery remains OFF. Do not move Supabase region or upgrade paid resources based on non-paired stats.

**Next step R18-29 (not included here):** build a disabled-by-default client finalization adapter and adversarial mock transport tests for route-prefix verification, lost ACK replay, no duplicate Commit, permission revocation and explicit backend compatibility gating; then consider a separately approved isolated test deployment when the staged SQL dependency chain is safe.
