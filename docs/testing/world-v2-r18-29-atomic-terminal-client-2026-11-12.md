# B10-R18-29 — Disabled-by-default atomic terminal client (NO-GO live)

**12 November 2026, Australia/Melbourne | cumulative stage only | no production SQL, Vercel rollout, or main merge**

## Baseline and release dependencies

This package starts on cumulative R18-28 draft PR #132 exact head `6a99ccaabde66978289b7cc053155a1934e17610`. That parent stages a *new optional*, authenticated-only `public.finalize_world_motion_v2` that executes the existing server-authorized Advance then canonical Commit in a single PostgreSQL transaction, with source-authoritative endpoint, permission rechecks, exact replay receipt and rollback on failure.

The currently deployed production frontend **remains R18-24 QA-only** `dpl_7HUmXi7eQ2oq2Y5HiW6r5Pvzq1HN`; prior R18-25 extra instrumentation was rolled back. Live Supabase still contains **83** registered migrations and **not R05** `20261111023204`. None of the R18-17 wall, corrected R18-19 cross-map, R18-20 campaign, R18-26 collision prefilter, R18-27 Commit or R18-28 atomic finalization candidates have been versioned or applied. The server R18-28 RPC and its two receipt fields do not exist live.

R18-29 is client code **only**. No SQL and no public API are installed or activated here.

## Default-OFF operation — two explicit constructor gates + build flag

`WorldV2TabletopRuntime` computes the finalization opt-in only when **both** `!dmPreview` and `import.meta.env.VITE_WORLD_V2_ATOMIC_FINALIZE === '1'`. The runtime passes this boolean into the `AuthorityClient` and `MovementController`. Each constructor independently defaults its terminal gate to **false**. All existing production Vercel variables were inspected by **name only** (no decrypted values); no `VITE_WORLD_V2_ATOMIC_FINALIZE` key is configured. The feature is OFF in all existing deployments; Vercel has **not** been changed to enable it.

Do not enable the flag until the reviewed R18-28 backend and preceding SQL dependency chain are installed, and an explicit release review authorizes it. A missing RPC fails closed and **cannot** cause a client fallback to ordinary Commit after an uncertain finalization.

## Exact client protocol

1. The normal gesture already has a V2 actor-bound Begin reply. Ordinary drag/keyboard samples still enter the same bounded, ordered path queue. No client-supplied collision outcome, JWT, role, fog, new topic, or position permission is introduced.
2. `MovementController` sends the optional final RPC only if (a) enabled explicitly, (b) the gesture is **closing**, (c) it is **not player preview**, and (d) the last ordered batch fits fully within the existing 8-target/24-cell limit and has no pending remainder. Prior batches use the **unchanged original Advance**. A gesture whose Advance has already finished and has no pending targets still uses the **unchanged ordinary Commit**. If the feature is off, no code path calls the new RPC.
3. A terminal response must match the *complete* expected exact wire grammar `version=2,sessionId,seq,commitSeq=seq+1,finalized=true,blocked:boolean,accepted:point[],endpoint:point`, with **no unknown fields**. Every accepted coordinate must be an exact 8-connected prefix of the locally requested route; if `blocked=false`, the prefix must be the *entire* route. There must be at least one accepted coordinate; the endpoint must be byte-equivalent as integers to the last accepted server step. Forged session, sequence, path, endpoint or extra metadata are rejected before painting. A partially blocked batch may commit only its approved prefix and exposes the normal local denied-cell feedback; the client never fabricates hidden collision geometry.
4. The existing `onGesture` path still sees only approved, blocked and committed events. For finalization success, the controller emits approved/blocked, then one committed event. It **never issues the separate Commit** for that gesture afterward.
5. The transport sends only `p_session,p_seq,p_from,p_targets,p_environment_revision,p_permission_generation` to the R18-28 RPC. Session map sequence accounting consumes both the final Advance sequence and its internally performed Commit sequence. The request is copied once, with no private coordinates written to logs. A **thrown network transport error** (possible lost response after server Commit) permits **at most ONE retry of the identical request object**, within the same session. No new sequence, different endpoint, ordinary Advance/Commit fallback or speculative completion. Explicit Supabase RPC error, NULL denial, malformed reply or second transport failure rejects the gesture, invokes existing cancellation/reauthorization, and cannot approve a position.
6. On permission/map/scene change, local cancellation clears the active gesture; any later HTTP ACK is ignored. A transport instance whose session was cancelled or disposed also refuses a replay.
7. The V2 in-memory trace only adds allowlisted `authority.finalize` duration and `authority.finalize.sample` coarse timing events, plus `invalid-final-ack` as a fixed safe rejection label. No raw payload, coordinate, user ID, JWT, hidden NPC, private fog or signed sight enters trace storage/network. Existing `QA capture` export will include the metric automatically if, and only if, the user opted in with `?worldV2Trace=1`.

## Verified test boundaries

`tests/world-v2-r18-29-atomic-finalization-client.test.mjs` provides **18** adversarial Node cases: default-OFF behavior; single short drag; 24-cell Advance + final batch; already-active ordinary Advance/Commit; no persistent preview; partially blocked approved prefix; NULL fully-blocked/unauthorized final rejection; forged session/sequence/commitSeq/endpoint/metadata/path; invalid ACK; in-flight revocation; missing/falsy flag; exact-once retry on thrown transport failure; no retry on explicit error/NULL; no second retry after another error; no replay after session cancellation; bounded trace metric; compile-time flag wiring.

Frozen R17, R18-15 and R18-24 source hashes are all preserved. The amended R18-05 source-lock test now adds an **explicit R18-29 MovementController reviewed blob SHA** without rewriting the old R17 or R18-15 fingerprints. The R18-15 continuation test now validates the older Advance/Commit path under the default-OFF flag. R18-28's older security contract has been updated only to allow this **separately reviewed opt-in** client (no client call when disabled).

The cumulative R18-28 SQL fixture still runs the real frozen R05, R18-17/19/20, rollback-only R18-26 (4,860/4,860 geometry source parity), R18-27 (13 authority tests), and R18-28 (16 terminal authorization, revocation, privacy and rollback tests). **It does not give permission for production SQL.**

## Known limitations and follow-up engineering

- **No live speedup yet.** Neither the R18-28 public RPC nor this frontend implementation has been installed/activated in production. Saving one HTTP request is an architectural opportunity, not a measured performance result.
- A wholly blocked terminal batch returns NULL on the staged server. The enabled client must fail closed and cancel, not assume the previous accepted route was canonically committed. This is safe but can produce worse interaction after a collision than the old two-call path. This warrants a later full behavioral integration test before approval.
- Retries recover lost transport outcomes **only once**. If both acknowledgments are lost, the local client refuses to guess whether the database already committed; a newly signed sight must reconcile. This can feel temporarily delayed, but must never invent a canonical endpoint or leak private fog.
- The current server still processes prior Advance batches sequentially and reruns complete canonical validation. Reducing the final HTTP request does **not** solve every corner/collision or 1-second Commit delay.
- Server and client test suites presently run separately: genuine signed DM/Player 1/passive Player 2 fog, private Realtime recipient isolation, map/permission revocation and actual gesture performance are **NOT VERIFIED**. A mock response or DM player preview is insufficient evidence.
- Supabase backend is currently in AWS Tokyo (`ap-northeast-1`). Distant network latency is plausible but not measured from paired browser/DB timings; no region migration/paid tier is approved.

## Hard release gates

**NO-GO** until operator-authenticated pinned Supabase CLI v2.81.3 completes exact history reconciliation and R05-only linked dry-run, R05 is separately authorized and installed, all later SQL is precisely versioned and applied in audited order, private/LOS authorization is certified through three independently signed live browsers, and end-to-end RTT and collision behavior meet explicit usability targets. Rollback options and the default-OFF flag must be rechecked immediately before any production or live-test promotion.

**Next work package R18-30:** executable cross-layer client/server contract fixtures, robust blocked-only final semantics, bounded latency budgets, and a release-gated opt-in canary plan. No production switch or new testers are needed for this source-only R18-29 stage.
