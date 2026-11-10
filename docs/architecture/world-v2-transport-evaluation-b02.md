# B02 — World Engine V2 authority transport evaluation and selection

**Decision:** **Select Option A: coalesced, one-in-flight Supabase RPC authority with server-generated private Realtime observer progress.**  
**Status:** Design/read-only modeling **STAGED**; no implementation, SQL apply, migration, feature flag enablement, merge or deployment.  
**Recorded:** 10 November 2026. Production source: `main@b246b3a72537b53b2afc2a9a38cbe1db3609a8af`. Staged parent: B01 draft PR #76 at `f84743986a380e2d6ec5bfda8deea697d7f0e3e1`.  
**Governance:** This is the B02 design-only exception recorded in B01. A06 remains **BLOCKED**; Gate A **NOT PASSED**. Nothing below asserts real-world multiplayer p95 or gives permission for B03 implementation or production release.

## 1. What is actually measured and implemented today

**Read-only verification (10 November 2026, 11:47 UTC):** the connected Supabase project is `ACTIVE_HEALTHY`, Postgres 17, with **83 applied migrations**. `pg_stat_statements_info.stats_reset` is **2026-11-05 09:51:43 UTC**; the repeated read-only call statistics have not changed from A06:

| Current V2 SQL operation | Historical calls | Historical mean DB execution | Historical max | Notes |
|---|---:|---:|---:|---|
| `begin_world_motion_v2` | 250 | **24.30 ms** | 743.61 ms | PostgreSQL execution only |
| `advance_world_motion_v2` | 426 | **53.20 ms** | 1,534.19 ms | Includes server wrapper/observer work |
| `commit_world_motion_v2` | 209 | **135.74 ms** | 2,765.80 ms | Transactional revalidation/writes |
| `get_world_visibility_v2` | 622 | **49.16 ms** | 1,844.02 ms | Independent viewer sight |

These are **aggregated historical means and maxima over multiple releases**, not a trace of one gesture, not p50/p95, not client-to-server RTT, and not proof that the commit causes visual flashing. A05 first-paint/RAF/terrain/sprite tracing is staged only (PR #74); real DM/P1/P2 browser telemetry is **NOT RUN**. No attributable per-gesture cost or packet count can yet be calculated from this snapshot.

**Source-verified actual runtime:**
- `src/engine/v2/MovementController.js` serializes `begin` → one or more awaited `advance` RPCs → `commit`; it already has **one in-flight advance** and a `takeGestureBatch` path queue. Therefore simply claiming "add batching" would be false: B05 must change *when/how accumulated route samples are coalesced and released*, not recreate the existing adapter.
- `GesturePath.js` preserves turns/reversals and collapses only forward-collinear samples; maximum **8 target waypoints / 24 expanded cells per batch** in the active controller; a session is bounded to **64 batches / 128 attempted cells**. These are distinct limits; some individual requests can be much shorter.
- `AuthorityClient.js` calls authenticated public RPCs. `20261109095000_world_engine_v2_motion_authority.sql` enforces actor/map/ownership/group footprint and swept collision, monotonic sequence, session expiry, then rechecks the accepted route under row/revision locks at commit.
- `20261109100000_world_engine_v2_private_observer_stream.sql` wraps each successful `advance` and may issue per-recipient `realtime.send` events after server-side fog/LOS filtering. One accepted batch can therefore incur **viewer_streams writes and audience-dependent observer work**; coalescing changes both latency and how often remotes are notified. The server suppresses duplicate advance observer emission.
- `PredictionGrants.js` allows only current-scene, current-permission, **single-cell server-certified quadrant** presentation. **Grant expansion is B06**, not a B02 implementation. The local first-visible-motion performance target is not solved merely by swapping the network transport.
- `RealtimeTransport.js` locks and resynchronizes privately; any observer failure/revocation must not be turned into speculative client motion. Draft PR #71 remains independently **AMEND BEFORE MERGE**.

## 2. Concrete alternatives

### Option A — Existing Supabase PostgREST RPC, smarter ordered coalescing **(selected)**

```text
Pointer / arrow / touch input (60Hz local samples)
    ↓ preserve ordered bends; discard only redundant collinear samples
V2 movement adapter: at most ONE advance in flight per gesture
    ↓ bounded flush: next contiguous certified route, ≤8 targets/≤24 cells
Authenticated Supabase RPC: begin / advance / commit / cancel
    ↓ authoritative SQL ownership + scene revisions + swept collision
Private server-built Realtime per-recipient accepted path segments
    ↓ preexisting viewer roster/sight / monotonic cursor / CSS interpolation
DM + permitted players (during drag)
```

**Controller policy for B05 proposal:** Keep the deployed adapter unchanged behind a disabled feature boundary. Begin once. While an advance is pending, accumulate *ordered* turns; on reply, discard only the accepted prefix and send a newer bounded batch without waiting for individual grid-cell requests. Do not overwrite a bend or reverse path with the newest pointer endpoint. Never forward client positions to other peers. Maintain a short bounded pending queue, a strict one-in-flight rule, cancellation generation, session expiry and a last certified safe frontier. Final release waits for all in-flight accepted prefixes before an idempotent committed endpoint; a stuck request must have an explicit timeout and state resync rather than an endless blocking `await`.

**Progress rule:** Aim initially for **no more than 5 accepted observer batches/s per moving gesture** (an engineering modeling cap, not a measured optimum), send promptly when validation completes, and dynamically throttle by global Realtime message budget, active observers and actual RTT. This cap is **not** a promise of 5Hz delivery: with one in-flight RPC, 200ms RTT or slower DB execution can force a lower rate. Prefer a bounded interval over silent commit-only updates; client interpolation is cosmetic and cannot invent unapproved travel. A final progress segment/commit should not be omitted. Hidden spectators receive no payload. The authoritative server—not the client—determines recipient membership/visibility.

**Compatibility:** Keep SQL authority as canonical; reuse existing private observer topics and fog/LOS filters, React render identity and current V2 session version. B03 may provide a backwards-compatible versioned path-validation candidate; B05 remains feature-gated until integrated testing. Preserve existing player-preview's local-only simulation. No per-cell canonical `map_tokens` writes.

### Option B — Dedicated authority WebSocket on Supabase Edge Functions (deferred, not selected)

```text
Browser authenticated WebSocket
    ↓ Supabase Edge Function gateway, token/session verification
Persistent connection accepts ordered bend batches
    ↓ STILL must call trusted PostgreSQL authority SQL
Authenticated actor-bound SQL checks and atomic commit
    ↓ same private, server-filtered Realtime observer paths
Authorized viewers
```

A Supabase Edge Function can accept WebSockets, but the **socket is a transport proxy, not a new source of world truth**. It cannot rely on process memory for durable motion sessions, visibility, locks or revision ordering: workers can restart/terminate and reconnects need idempotent DB state. Passing user auth to the database must retain the same `auth.uid()` semantics and SQL grants. A server-side `service_role` call without explicit equivalent actor checks is **not acceptable**. It must never publish an unfiltered game-wide broadcast or let an Edge Function bypass LOS.

This design adds a JWT-verification boundary, long-lived socket reconnect/replay, DB hop/pooler connection management, worker cold starts, load balancing and operational monitoring. It **does not remove SQL validation, final commit or the need for path coalescing**. Supabase's current free Edge Function limits include **500,000 invocations/month**, **256 MB worker memory**, **150-second maximum worker lifetime** and **2 seconds CPU per request** (source links below); connection counts and restarts would need real testing. A WebSocket may lower browser network overhead on some routes, but it might increase end-to-end delay if edge-to-Postgres latency or cold starts dominate. No dedicated-transport prototype has been run against user sessions.

A Vercel/third-party always-on authority host is not selected: it introduces an additional security/availability/cost domain without evidence of a net benefit and cannot be assumed to offer durable free-tier sockets.

## 3. Reproducible latency sensitivity model (**not a benchmark of deployed software**)

Let:
- `R` = **one full browser↔PostgREST RTT**, excluding database execution, set to **0, 100, 200 ms** solely as simulated scenarios.
- `n` = number of `advance` RPCs in one gesture; original example **4**, coalesced example **1**, each still `begin + advance(s) + commit`.
- Historical representative means `B=24.30 ms`, `A=53.20 ms`, `C=135.74 ms`. These are **not** per-path-length predictions. They are used only for a constant-cost thought experiment.

Formula: `T_RPC(n,R) = (n+2)×R + B + n×A + C`. No Realtime delivery, fog refresh, UI paint, auth retry, startup or parallel work is included. Do not combine independent SQL means and call the result a measured gesture time.

| Hypothetical RTT | 4 advances (6 serial RPCs) | 1 advance (3 serial RPCs) | Illustrative saving |
|---:|---:|---:|---:|
| **0 ms** | 372.84 ms | 213.24 ms | 159.60 ms |
| **100 ms** | 972.84 ms | 513.24 ms | 459.60 ms |
| **200 ms** | 1,572.84 ms | 813.24 ms | 759.60 ms |

For a four-batch gesture, the model avoids **3 serial RTTs (50%)** plus three historical-average advance costs. **The actual coalesced batch may cost substantially more than the old individual advance mean**, because it validates more cells/recipients. Under a single in-flight design, additional observer updates may also be less frequent; quality must be measured, not inferred. If a gesture is already completed with one advance, the transport saves **zero RPC calls**; local certified grant rendering (B06) and reducing commit work may be more important.

**Time to first server-accepted remote segment**, under the same illustrative assumptions, is at least `B + A + 2×R` (**77.50, 277.50, 477.50 ms** at the three RTTs), plus Realtime delivery/paint. This does *not* mean the local user has to wait that long for certified presentation. An unusually large first batch could worsen first progress; cap the route and measure.

**Option B break-even calculation:** For an identical three-operation coalesced protocol, let `E` be one browser↔Edge WebSocket message/reply RTT, `D` be the additional Edge↔database overhead **per** authoritative operation and `S` be handshake/cold start/reconnect overhead. Then `T_Edge ≈ B+A+C+3(E+D)+S`. Relative to Option A, it is faster only when **`3(E+D)+S < 3R`**; without measured `E,D,S`, this is *not* an improvement claim. An illustrative **optimistic-only** scenario with `E=0.6R`, `D=15ms`, `S=0` would yield **258.24, 438.24, 618.24 ms** at R=0/100/200; even this does not include worker restarts, cold starts or app overhead and loses to direct RPC at R=0. There is currently no evidence the deployment satisfies these assumed conditions.

### Observability needed to turn estimates into actual data

Collect at defined 0, 100 and 200 ms *emulated* RTT (fix device, browser, fixture and exact deployed revision): input-to-first-safe-position p50/p95; gesture end-to-commit p50/p95; begin/advance/commit per-RPC client RTT and database execution; accepted cells and bends per batch; number of advances per gesture; private observer send/receipt/presentation delay; errors/retries; per-client queue age; `viewer_streams` updates; fog/terrain/sprite invalidation counts; active recipient count and total Realtime messages. A06 is needed to qualify any live improvement.

## 4. Free-tier capacity and illustrative message accounting

Current official Supabase references (checked **10 Nov 2026**):
- Free database **500 MB per project**; **Realtime 2,000,000 messages/month**, **100 messages/s**, **200 concurrent connections**.
- Free Edge Functions **500,000 invocations/month**, **256 MB worker memory**, **150-second maximum worker lifetime**, **2-second CPU/request**.
- Supabase Realtime broadcasts count the **sent message plus a message per receiving subscriber**. `realtime.send` private topics enforce subscription scope, **not** database row privacy; server-side LOS filtering remains mandatory.

An approximate private-stream budget assumes 1 active mover, **3 permitted observers**, each subscribed once, **5 accepted batches/s**, and **1 per-recipient private broadcast per batch**:

```text
messages per batch = 3 × (1 sent + 1 received) = 6
messages per second = 5 × 6 = 30
messages per hour of sustained movement = 108,000
4 active movement hours/month = 432,000 messages
2,000,000 message cap / 30 per second ≈ 18.5 hours of aggregate activity
```

That is an **illustration**, not measured usage and not a quota reservation. Multiple browser tabs, more recipients, concurrent drags, chat, presence and subscription events raise total consumption; fewer authorized recipients lower it. Two simultaneous movers in the same model approach **60 messages/s**, leaving only 40 messages/s theoretical headroom within the 100/s free limit. **Do not allow a high-frequency unbounded private fan-out to saturate Supabase Free.** A recipient-aware throttling budget must be explicitly enforced/tested before B07.

Option A adds **no new paid product or Edge Function**; its potential cost reduction is fewer RPC invocations, motion-session writes and private stream emissions, subject to measured per-batch SQL work. Option B incurs new Edge Function calls, reconnects, higher complexity and DB calls *in addition* to existing private Realtime traffic. Direct browser-to-Edge WebSockets are not free of auth, data egress or connection lifetime costs; no guaranteed numeric advantage can be assigned without real session benchmarks.

## 5. Decision matrix and falsifiable re-evaluation

| Evaluation | Option A: coalesced RPC | Option B: dedicated Edge WebSocket |
|---|---|---|
| Server authority / fog | Reuse audited V2 `auth.uid`, swept collision, private LOS | Must recreate auth proxy and still call same SQL |
| Required infra | Existing Postgres + Realtime; **no new platform** | Existing Supabase Edge quota but new connection/worker layer |
| RTT reduction | Avoid excess sequential advances; still begin+advance+commit | Potentially lower per-message RTT, but adds Edge-to-DB hop |
| Streaming observers | Existing server-generated private paths per approved batch | Must continue through same private authority path |
| Cold-start/reconnect risk | Existing HTTP/realtime recovery | Additional worker/websocket lifetime/replay state |
| Free-tier pressure | Reduce unnecessary SQL/observer work; still respect Realtime caps | Edge invocations/CPU/egress plus current DB/Realtime load |
| Tested performance | Only historical SQL means; **not validated live** | **No prototype or measurements** |
| Delivery/rollback | Narrow B03–B09 feature-gated path | Higher migration, operational and failure-mode surface |

**Selection: A.** It removes avoidable serialized requests while preserving the only existing authenticated authoritative system, giving a tractable small-diff sequence. **It is not a claim that Option A alone resolves flashing or guarantees 60fps.** The renderer/fog cause remains unresolved and must be addressed by C01–C06 / PR #71 amendments when safe.

**Re-open B only if**, after authenticated A06 and staged A performance work, a controlled identical-session comparison shows (a) RPC network transit dominates p95 despite coalescing and current certified local motion, (b) an Edge transport using the identical SQL validator improves measured remote/commit p95 materially—proposed minimum **25%** across comparable fixtures, including 200ms RTT—with no security violations, (c) worker restarts/reconnect and exact-once commit can be proven, and (d) realistic concurrent/free-tier usage stays within quotas. A one-off faster test is insufficient.

## 6. B03–B10 implementation boundaries and risks (not work executed in B02)

- **B03 (SQL candidate only):** versioned, backward-compatible path validation; retain all existing grants/RLS/SECURITY DEFINER privilege boundaries, exact ordered-bend swept collision, stale revision rejection, group atomicity, TTL/idempotency and existing checkpoint triggers; never silently change applied migration history. Any SQL proposal is **staged only**, not installed live.
- **B04:** hostile input/clock/replay tests (B01 H01–H20) with static vs isolated vs live labels; specifically test batch wall-leap, stale grants, victim token IDs and recovered same-scope unknown pieces.
- **B05:** one in-flight newest **ordered** pending route, not newest endpoint shortcut; deterministic cancellation, bounded queue, fast first progress, feature flag off by default; keep deployed adapter intact.
- **B06:** independent scoped, finite safe local grant after server certification; do not load hidden collision topology or speculate past an unknown boundary.
- **B07/B08:** per-recipient observer budget and monotonic cursor during drag; server atomic commit, late-ack dedupe and sprite handoff; no full-map invalidation from ordinary movement.
- **B09/B10:** keyboard/touch/group/preview parity, full integrated CI/CodeQL/migration review and **real** DM/P1/P2 browser acceptance. PR #71 remains blocked and must not be silently integrated. No deployment without separate release authorization/verified Gate A.

### Explicit blockers / stage boundary

- **A06 still BLOCKED / Gate A NOT PASSED:** signed-off protected test fixture, A05 deployed diagnostic telemetry and three independently authenticated DM/P1/P2 sessions are missing. B02 cannot approve B03 execution under the existing design-only exception.
- **PR #71:** hard bounded sight-retention deadline (including hanging RPC), no new input while private stream locked, actual renderer/permission recovery tests, selective resource refresh and exact-head CI.
- **Uncertain economics/performance:** no browser-to-Edge or Edge-to-DB RTT, cold-start, session traffic, load-test p95 or actual observer message billing measured. Free quota is not a guarantee of capacity under stress.
- **Database migration provenance issue #69** remains owned by E05; do not reapply migration aliases or reconstruct live schema by writing SQL.

**Handoff:** B02 design choice **STAGED**. B03 is the next numbered implementation candidate, but is **gated by Gate A or a separately recorded scope-limited staging-only exception**. The existing delegated B01/B02 exception does not authorize an applied B03 migration, integration release or production deployment.

## Sources (primary, checked 10 Nov 2026)

**Repository sources:** [B01 protocol contract](world-v2-authority-contract-b01.md); [V2 authority client](../../src/engine/v2/AuthorityClient.js); [V2 movement controller](../../src/engine/v2/MovementController.js); [GesturePath](../../src/engine/v2/GesturePath.js); [V2 SQL authority](../../supabase/migrations/20261109095000_world_engine_v2_motion_authority.sql); [V2 private observer](../../supabase/migrations/20261109100000_world_engine_v2_private_observer_stream.sql); [A06 baseline](../testing/world-v2-a06-live-baseline-2026-11-10.md). These relative paths refer to the staged integrated branch, not production main.

**Official documentation:** [Supabase Free quotas](https://supabase.com/docs/guides/platform/billing-on-supabase); [Realtime limits](https://supabase.com/docs/guides/realtime/limits); [Realtime message accounting](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages); [Edge Function limits](https://supabase.com/docs/guides/functions/limits); [Edge Function WebSocket/reconnect example](https://supabase.com/docs/guides/functions/examples/resumable-websockets); [Realtime Broadcast security considerations](https://supabase.com/docs/guides/realtime/broadcast); [Edge Function invocations](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations).
