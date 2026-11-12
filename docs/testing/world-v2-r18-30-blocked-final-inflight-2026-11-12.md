# B10-R18-30 — Blocked finalization and delayed Advance input ownership

**12 November 2026 (Australia/Melbourne). STAGING ONLY. Production SQL and frontend release NO-GO.**

## Source of truth

Starts from cumulative B10-R18-29, draft PR #133 exact head `f1ce095aadbd0927c074a31c7404a9dd98e4452c`. The production Vercel domain remains on earlier **R18-24 QA-only** `dpl_7HUmXi7eQ2oq2Y5HiW6r5Pvzq1HN`. Live Supabase has **83 registered versions** and frozen R05 `20261111023204` **unapplied**. The R18-25 instrumented frontend was previously rolled back. R18-17/19/20/26/27/28 SQL candidates remain separately staged, not versioned or installed. R18-29 atomic finalization build flag remains **OFF**.

## Bug 1 — valid movement lost when final attempted cell is fully blocked

R18-28 rejected any atomic final Advance with an empty `accepted[]`. That rejected **both** (a) a first-cell wall collision (zero gesture movement), and (b) a blocked *last* batch after earlier Advance batches already approved progress. In case (b), the SQL inner transaction rolled back the final attempt, and the normal client rejected/cancelled rather than running the trusted Commit over the prior approved steps. This could lose a previously valid drag endpoint. In case (a), an expected wall contact could appear as a generic failed gesture.

**Source fix** `supabase/candidates/world_v2_r18_30_blocked_final_semantics.sql` is an **unversioned** replacement of ONLY the R18-28 public finalization function; previous R18-28 source remains pinned and intact.

- If the final Advance is **wholly blocked, and the actor session has no previously approved cells**, the RPC returns a newly defined, explicit, server-signed terminal receipt: `{version:2, sessionId, seq, commitSeq:seq+1, accepted:[], blocked:true, endpoint:<original actor-locked cell>, finalized:true, noMotion:true}`. The session becomes `status='cancelled'` (not a fake committed token movement), with an exact request fingerprint and brief retry window. The RPC writes **no canonical token/tool movement** or private approved path; `cancel_world_motion_v2` still cannot transform it into a Commit. The same actor can retry only the **exact request**, while map membership, current scene and permission generation are still authorized. Wrong actor, changed target/revisions, expired or revoked permission all return NULL.
- If the final Advance is **wholly blocked, but prior server-authorized steps exist**, the RPC obtains the endpoint from the actor-locked **previously approved** `s.last_x/y` and calls the ORIGINAL `commit_world_motion_v2` for those earlier route legs. Returned shape has `accepted:[], blocked:true, endpoint:prior-authorized cell, finalized:true` and **no** `noMotion` property. Original revalidation, sweeps, checkpoint, row locks, triggers, signed private observer drain, and exact Commit retries remain mandatory. No wall penetration can be authorized.
- If a final batch accepts a nonempty prefix, or is wholly clear, the existing R18-28 path and reply grammar remain unchanged. Missing, malformed or non-blocked empty replies remain fail closed. No new grants or RLS changes are introduced; the new function remains authenticated-only.

**Client fix**: `validAtomicFinalizationAck` permits an empty accepted array only for a strictly blocked reply whose endpoint equals the *already server-approved* `from`, and whose `noMotion` presence exactly matches whether previous batches had approved cells (`g.hadMotion`). Invalid endpoint, unknown fields, forged no-motion, and any unconfirmed position still reject. A legitimate no-motion terminal result surfaces `noMotion:true` to the gesture handler, so the renderer does **not** create an incorrect canonical-position handoff. Older R18-29 fast path remains default-OFF; DM preview remains local.

## Bug 2 — rapid pointer input could be swallowed while awaiting Advance

A delayed Advance previously kept its chosen head waypoints in the same mutable `g.pending` array as fresh pointer input. A new forward pointer could coalesce/overwrite that *in-flight* head. After the delayed ACK, `g.pending.splice(0,batch.consumed)` removed the *new* target rather than just the previously submitted one. Returning to the old origin while the RPC was running could also be ignored because the input append helper compared to stale `g.approved`.

**Source fix**: the controller removes the already selected `batch.consumed` waypoints **before awaiting** the RPC. A short-lived `g.inFlightTarget` records the endpoint of that in-progress batch for subsequent pointer samples, so reversal and forward intent append relative to the correct future anchor. The pending queue then contains *only* new/unsubmitted work. A server-ACKed collision still explicitly discards all unapproved pending motion. No new client network calls, position broadcasts, local wall authority, fog grants or private data are added. This queue safety fix also operates with the atomic feature disabled.

## Source-real integrated verification

`tests/world-v2-b10-postgres/blocked-final-r18-30.sql` runs **only** inside the protected fresh PG17 CI database, with the existing R05→R18-17/19/20 schema and R18-28 installed **inside BEGIN/ROLLBACK**. Tests exercise actual actor-bound token Begin, Advance, trusted Commit, mounted wall scene, denied attempts, zero-motion receipt, exact retry, altered request and wrong actor, permission-generation revocation, authenticated canonical movement back to start, earlier-approved steps plus a fully blocked final cell, private observer path retirement, and complete rollback of the new RPC and receipt columns. **13/13** PostgreSQL assertions passed.

The fixture exports **five real PostgreSQL JSON wire replies** (normal movement, zero-motion first blocked attempt, exact retry, prior-approved blocked last attempt, exact retry) to a bounded local `/tmp` file. `tests/world-v2-b10-postgres/verify-blocked-final-r18-30.mjs` loads those exact bytes and runs them through `validAtomicFinalizationAck` and the actual `createMovementController`; all five must be accepted only in their matching prior-motion state, all forged endpoints rejected, no extra Commit RPC. It also verifies a **synthetic request-count budget**: a compatible last-batch path uses one HTTP RPC instead of two. The 100/225/450 ms assumed per-call values are only algebraic scenarios, **not measured live latency**.

`tests/world-v2-r18-30-blocked-final-contract.test.mjs` pins original R05, R18-27 and R18-28 SQL source Git blobs, checks the new function surface and ACL constraints, rejects forged no-motion replies, and proves the cross-layer runner. Four further adversarial tests hold an Advance unresolved while the pointer moves forward, reverses to origin, hits a server-confirmed wall, and runs the feature-off legacy path; every byte of later intent must be delivered or deliberately discarded by a server-blocked ACK, never lost to queue mutation. The earlier R12 handoff contract and R18-05 source lock were strengthened to review these changes while retaining all R17/R18-15/R18-29 fingerprints.

**Caveat:** Previous R18-29 only uses atomic finalization when a batch is truly *closing and not yet in flight*. An ordinary long drag where final input has already triggered Advance still uses the original separate Commit; do not promise removal of a round trip on every gesture.

## Release gates and next step

Do **not** install R18-30 SQL in isolation, promote R18-29/R18-30 client code, set `VITE_WORLD_V2_ATOMIC_FINALIZE=1`, disable observer/LOS checks, enable guarded 700 ms recovery, upgrade paid infrastructure, or merge main based solely on simulated/post-R05 PG17 evidence.

The operator still needs the authenticated pinned Supabase CLI v2.81.3 linked 83-body history and strict R05-only dry-run, separately approved versioned R05 and later SQL, and independently authenticated real DM/P1/passive-P2 fog/LOS/private Realtime/revocation and sustained movement acceptance. **No users need to test R18-30 today**: live production is intentionally unchanged.

**Next work**: prepare a read-only, zero-cost latency measurement protocol and a canary release plan that separates the safe client queue fix from the still-uninstalled full movement/security SQL release. Real browser RTT comparisons remain mandatory before claiming a player-facing speedup.
