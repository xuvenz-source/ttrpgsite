# B07 — Recipient-private, bounded observer progress during drag

**Recorded:** 11 November 2026 (Australia/Melbourne).  
**Status:** STAGED SQL CANDIDATE ONLY — **NOT INSTALLED**.  
**Production:** `main@b246b3a72537b53b2afc2a9a38cbe1db3609a8af` unchanged.  
**Stacked parent:** B06 PR #81, `9aac3b0cfacf3131a5438fc34e8badb31b9b42e7`.  
**Authorisation:** The designer's **“Alright proceed”** following B06 specifically authorizes B07 staging, isolated testing and documentation; A06/Gate A remains **BLOCKED/NOT PASSED**. No live SQL, grants, merge, deployment, feature activation, B08 or release gate waiver.

## Existing behavior and B07 target

Current World Engine V2 *already* emits approved observer progress before drag release. The deployed V2 private publisher `20261109100000_world_engine_v2_private_observer_stream.sql` checks `auth.uid()`, server motion-session authorization, recipient campaign membership and active map, individual token/tool visibility, and the server's trusted LOS/fog verification. It then writes recipient-private `viewer_streams.seq` and calls `realtime.send(..., true)` for each authorized viewer of **every accepted advance**. Each wire packet has exactly `version, mapId, viewerId, seq, environmentRevision, permissionGeneration, items` and at most 25 contiguous points per selected piece. The receive-only `RealtimeTransport` refuses unknown tokens, duplicate/late/scope-inconsistent frames, sequence gaps and missing signed sight.

**B07 must reduce needless recipient Realtime traffic without hiding a skipped step, inventing visibility or breaking monotonic cursors.** Throttling by dropping every Nth message would create path discontinuities and could cause receiver resyncs/flashing. B07 instead stages a server-side recipient buffer with private, bounded, coherent FIFO progress.

## Staged implementation

**Source:** `supabase/candidates/world_v2_b07_private_observer_budget.sql` (**not** `supabase/migrations`). The candidate extends only the **private** `forge_world_v2` schema with:
- `observer_pending_b07`: a session + viewer keyed queue, each row bound to actor, map/campaign, environment and permission generations and absolute 60-second session expiry. Holds a current bounded wire frame plus at most 63 FIFO deferred frames. Each frame is at most 48 selected items × 25 contiguous cells. RLS on, all direct browser privileges revoked; no client-supplied coordinates can be published.
- `observer_budget_b07`: one row-locked, transactional **movement-only** throughput allowance. Normal sends capped at 20 physical private broadcasts per second across this project's candidate publisher; up to 10 additional prioritized hide-broadcast slots. These are **not** complete Supabase usage/cost caps: every subscribed tab receives its own message, and other app traffic/presence also uses Realtime.
- `valid_observer_items_b07` and `merge_observer_items_b07`: reject unknown fields/IDs, noninteger points, nonadjacent jumps, duplicated piece IDs and >25-point paths. Merge only exactly contiguous subpaths and preserve turns/reversals. A `hide` supersedes a queued path and remains concealed; no client can force an unapproved reappearance.
- `filter_pending_observer_b07`: when publishing a queued path, re-check the **current** map recipient membership and source-real server `observer_path_status`, filtering concealed pieces and transforming partially hidden trajectories into a **hide-only** marker. No wall objects or hidden path are returned.
- `queue_recipient_observer_b07`: delivers the **first** accepted recipient-private motion immediately when the budget permits, then coalesces rapid accepted segments into the recipient's FIFO at a nominal **200 ms (5 Hz) cadence**. A full 25-point frame remains intact and newer accepted packets move to bounded FIFO frames. A budget outage defers, rather than consuming a cursor.
- `flush_recipient_observer_b07`: under row locks and after one last per-viewer auth/LOS validation, consumes a global allowance, increments **only that recipient's** cursor, and calls original `realtime.send(payload,'world-motion-v2','forge-world-v2:<map>:<viewer>',true)`. A Realtime failure rolls back that subtransaction's cursor/budget changes and retains the queued path for a later attempt; canonically accepted movement is not rolled back or re-authorized by Realtime.
- `flush_session_observers_b07`: an *internal-only, post-commit* drain helper requiring current actor and a **committed** server session. On a successful drain, removes fully exhausted queue rows. It is **not called** by the current public Commit RPC; B08 must safely wire it after the existing atomic canonical commit succeeds.
- A bounded, indexed, opportunistic removal of expired abandoned per-viewer queue rows, without a new cron worker or paid service. Normal `cancel_world_motion_v2` deletes active sessions, allowing the candidate's foreign-key cascade to clean their queues if installed.

The replacement `forge_world_v2.publish_approved_observers` is **source-derived from the existing server-trusted function**, leaving its viewer-selection, group-expansion, `observer_path_status`, 32-audience cap, and source authority unchanged; it calls the private recipient buffer instead of unconditionally incrementing a viewer cursor and sending in every advance. The public `begin/advance/commit/cancel` function interfaces are **not changed** by the candidate. No unfiltered game-wide public topic or browser Realtime publisher is added.

**Important:** A fixed 5 Hz target cannot be guaranteed with variable RPC RTT, long SQL work, send-budget exhaustion or terminal flush; it is a desired upper normal cadence rather than a measured performance or billable-message limit. Hides may bypass the 200ms normal interval when queued at the head, subject to the global priority budget. A spectator with multiple tabs can multiply billed deliveries. The conservative global allowance protects some headroom beneath Supabase Free's published 100 WebSocket messages/s limit, but does not guarantee the rest of the application stays within its quota.

## Isolated PostgreSQL 17 testing

A GitHub Actions `postgres:17` service runs the source-real V2 `begin_world_motion_v2` / `advance_core_v2` / public Advance wrapper, `session_valid`, collision checks, **source-extracted `viewer_on_map` and `observer_path_status`**, the complete B07 SQL candidate and an inert transactional `realtime.send` test sink. Local test-only `auth.uid`, map membership and the lower-level `forge_visibility.observer_verified_path_status` sight/LOS dependency are controlled **fixtures**, not real Supabase JWT verification or production fog physics. The ephemeral `battle_maps` grid columns match the live read-only verified integer types.

Test files:
- `.github/workflows/world-v2-b07-postgres.yml`
- `tests/world-v2-b07-postgres/schema.sql`
- `tests/world-v2-b07-postgres/extract_viewer_authority.py`
- `tests/world-v2-b07-postgres/hostile.sql`
- `tests/world-v2-b07-postgres/run.sh`

Behavioral/hostile assertions cover: no shortcut endpoints/unknown metadata/hide-path disclosure; exact contiguous/turn-preserving concatenation; hidden-piece stickiness; real actor-owned public Begin/Advance; two independent private recipients and individual cursors; no duplicate emission on replay; buffered 200ms progress; Realtime failure and retry without cursor loss; map membership revocation while paths are queued; global budget exhaustion and retry; **full 25-point packet capacity plus further accepted progress under quota pressure**, recovered FIFO in order; terminal committed-only helper; denied direct private schema/function access to `anon` and `authenticated`; RLS on both private tables; private topic requirement; terminal cleanup and abandoned TTL eviction.

**What the tests do not establish:** real authenticated DM/Player1/Player2 browser sessions, actual dynamic LOS/fog masks or mixed group × true fog under load, direct Realtime delivery and reconnection, high-concurrency race fairness, no paid quota or rate-limiting alert, client-to-server p95, browser first paint, zero sprite remounts, or completeness of final commit/cancel integration. Do not claim B07 alone fixes player-side map flashing.

## Security findings and release blockers

1. **Terminal integration is intentionally left to B08.** Without invoking `flush_session_observers_b07` *after a successful atomic final commit*, a quiet gesture may have pending recipient paths after release. B08 must cover commit succeeded/ACK lost/rollback, retry, terminal budget exhaustion, eventual resync, cancel/expiry, and per-viewer ACL/LOS changes. Do **not** apply B07 candidate independently.
2. **Priority hide under a saturated FIFO requires B08/B10 adversarial review.** Existing approved paths can be queued ahead of a later hide; a newer authorization must never expose the hidden continuation. Revalidate each buffered path at send time and prove hide is not delayed unboundedly when a recipient disappears. A forced sight resync is preferable to ever leaking hidden coordinates.
3. **B04 H39 remains unresolved.** Current source-real public Advance can answer changed-payload same-seq retries with a cached ACK rather than a generic rejection, although B04 proved no new progress event or endpoint mutation. Exact request-bound replay rejection belongs to B08 or a separately audited server fix.
4. **PR #71** is independently AMEND BEFORE MERGE for observer sight hanging recovery and input lock; no exception bypasses this.
5. **A06 / Gate A NOT PASSED.** DM/Player1/Player2 protected scenario acceptance, A05 telemetry and actual p50/p95/flash counts are missing.
6. **A nonapplied candidate isn't a production entitlement.** B07 must be integrated through a separately reviewed, versioned migration/rollback path, rechecked against live migration history and RLS grants, and approved with B08–B10 security/performance gates. No live testing/deployment was authorized.

### Free-tier and performance validation plan (later, not B07)

Measure on a controlled authenticated staging fixture the real accepted batches and per-recipient SQL sends, `viewer_streams` writes, total Realtime client messages (including duplicate tabs), movement-to-first-remote-render p50/p95, eyes-on map flash/terrain assignment/sprite remount counters, fog security and no-loss under rate-limit/reconnect. Compare to A06 baseline using the same committed revision, scenario and account roles. Supabase's [Realtime limits](https://supabase.com/docs/guides/realtime/limits) currently list **100 messages/s and 200 concurrent connections** for Free, but this is not a private traffic reservation or a guaranteed billable conversion.

**Next engineering microstep:** **B08 — atomic final commit/reconciliation and exact-replay hardening**. No implementation of B08 has been performed by this B07 step; it requires separate authorization under Gate A or another explicit staging-only exception.
