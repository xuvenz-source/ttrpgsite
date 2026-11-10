# B10-R02 — Budget-independent, signed observer recovery

**Date:** 11 November 2026, Melbourne.  
**Status:** STAGED OPT-IN / RELEASE **NO-GO**. No production SQL, database role changes, releases, map mutations, or feature flags have been enabled.  
**Stack parent:** B10-R01 draft PR #86, `a7275ec1f7103ccb0dc87dd2437b2857c0334533`.  
**Authorization:** Designer said “Proceed as you see fit” after B10-R01. This is precisely the next B10-R02 microstep in the approved one-step workflow; it does not authorize a database migration or production testing.

## Verified failure and rationale

The nonapplied B07 candidate stores recipient-private, server-filtered path and hide frames when its free-tier physical-publish allowance is exhausted; B08 opportunistically drains at final commit and on the identical ACK replay. If the actor leaves, there is **no independent trigger** to push deferred frames. A hide can also be delayed when the separate reserved hide allowance is used up. Queue TTL eventually discards messages, but does not update the recipient's renderer. Quiet map subscribers can keep obsolete canonical positions and previously visible pieces indefinitely.

Free-tier Supabase Realtime currently allows **100 events/s** and **2 million Realtime messages/month**, and broadcast fanout is billed/delivered per recipient tab. B07's 20 regular publishes/s plus 10 priority hides/s is not an account-wide event cap; it is still important to avoid an extra socket or frequent publish retries. Sources: https://supabase.com/docs/guides/realtime/limits and https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages.

### Engineering choice

**Do not add a job, timer-driven server worker, new database table, public RPC, Postgres NOTIFY or Realtime topic.** Introduce an independently scheduled, client-owned reconciliation of the existing server-filtered `get_world_visibility_v2` signed sight RPC. Unlike `get_world_observer_cursor_v2`, the signed sight contains the current **authorized canonical coordinates and visible-piece roster**; it catches *committed* movement and concealment even when **zero** observer frames were ever published. The renderer already diffs authoritative roster and fog cells; a cursor-only, unchanged sight does not reinstall the map image, redraw an unchanged fog mask, or recreate existing sprites.

The source change is hidden behind **`VITE_WORLD_V2_OBSERVER_RECOVERY=1`**, OFF by default.

## Behavior contract

1. The normal DM and real player V2 board **each** use at most one low-frequency recovery watch per mounted runtime. The first check is scheduled **6 seconds after start**, never during boot. Only one sight RPC may be in flight and the next interval is scheduled **after it settles**, so a slow server cannot create an unbounded pileup. Client timer interval is bounded 4–30 seconds.
2. Do not poll if the viewer's private channel is disconnected/locked, the active scene/sight is unauthorized, the map has changed, the client is disposed or the document is hidden. Foreground reentry initiates one immediate check, not a storm. DM **player preview never** starts a watch.
3. The check calls existing `visibility.refresh('observer-budget-recovery')` using the real actor's Auth session. It does **not** publish client coordinates or allow the client to choose fog, ownership or hidden NPCs. A rejected/invalid sight revokes the old renderer frame using the existing fail-closed `VisibilityController` logic; an already-revoked connected stream requests normal bounded resynchronization.
4. Only **after** the renderer accepts the signed canonical sight does the private `RealtimeTransport.acceptSignedSight` realign its roster and cursor. Scope, map/viewer identity, generations, monotonic cursor and integer coordinates must match, or the new reconciliation is rejected.
5. When a newer signed sight changes a piece's canonical cell, the transport records a per-piece signed origin **fence**. B07 deferred paths whose **first point is behind that new origin** advance the cosmetic stream cursor but are never passed to the renderer. This avoids a sprite rewinding/terrain sealing when a buffered, still-authorized old path arrives *after* a signed recovery. A later path beginning at the freshly signed cell may render normally. Unknown/concealed actors remain unpaintable from private motion alone.
6. No expansion of server roles, RLS, PostgREST endpoints, Realtime subscriptions or frontend build credentials. No extra service/billing tier. Existing local gesture/DM preview/scene change semantics remain intact.

### Honest limitations of this step

- A browser timer is not an enforceable server-side deadline: foreground scheduling can be delayed and the network or Auth service can be unavailable. This provides **eventual authoritative recovery while the server is reachable**, not a hard latency SLA or a guarantee during total network outage. Revoked sight must fail closed.
- Canonical coordinates update at **Commit**, not each active drag step. If the budget exhausts during a drag, no client can recreate missing server-approved intermediate progress. The canonical postcommit endpoint is recovered at the next successful signed sight.
- A delayed old path whose *start exactly coincides* with a newly signed canonical cell cannot always be distinguished from a fresh gesture without extra authenticated session/epoch metadata. Such ambiguous packets could still produce cosmetic backtracking; the new fence protects the common stale-origin case but does not fully certify every adversarial race. **Keep B10/Gate B blocked** until authenticated multi-client budget-saturation and deferred-frame tests demonstrate no rollback/flash, or add a separately reviewed scoped session revision/queue retirement protocol.
- Each active foreground viewer adds approximately 1/6 sight RPC per second when enabled (10 concurrent viewers about 1.7/s before failures or foreground returns). That is not a Realtime message; it is nonetheless extra Postgres/fog CPU and free-tier RAM pressure. Measured resource baselines, realistic user counts and a backoff/interval decision remain release prerequisites.
- The B07/B08 SQL queued frames themselves are not flushed on a timer, but the recipient can recover **current canonical state without the sender**. B07's TTL remains bounded, and the fallback never reads or publishes the private queue.
- This is a staging-candidate source implementation, not proof of real user performance. No A06 24-case DM/P1/P2 protected map acceptance or p95/flash stress test has been run, no PR #71 security/recovery resolution, and no versioned production migration/rollback plan exists.

## Staged changes

- `src/engine/v2/ObserverRecoveryWatch.js`: bounded foreground-only scheduler with one in-flight signed callback, lifecycle/dispose and error isolation.
- `src/engine/v2/WorldV2TabletopRuntime.js`: default-off flag, uses existing `vision.refresh`, accepts newer signed roster/cursor in transport after renderer approval, foreground resume and listener/timer disposal; disabled in preview.
- `src/engine/v2/RealtimeTransport.js`: signed canonical origin fences and strict sight-scope/permission/map/cursor reconciliation; no extra channel and no browser publish.
- `tests/world-v2-b10-r02-observer-recovery.test.mjs`: deterministic watch/timer bounds, no polling when hidden/unauthorized, no overlapping RPCs, disposal, canonical stale-path fencing, restored path continuity, concealed actor and forged-sight negative cases.
- `staging/world-v2-b10-release-qualification.json`, progress and release ledger: record R02 as **staged-unreleased** with explicit remaining no-go gates.

**Release rule:** Do not enable the new flag simply because Node tests, CodeQL, SQL fixtures or build pass. Run authenticated DM/P1/P2 with actually published fog/collision and deliberately exhausted B07/B08 recipient budget, validate caught-up signed coordinates and hides, and measure additional sight RPC load/renderer redraw counts on free tier. PR #71 and migration source parity remain separately blocked.

**Next:** B10-R03 should cover the subtle deferred-path equality race, version-safe migration packaging and PR #71 integration planning (each in its own incremental step as necessary). No automatic C01 or production deployment.
