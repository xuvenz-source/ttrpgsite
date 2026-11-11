# B10-R14 — Supabase resource context and passive-observer cadence

**11 November 2026 — STAGING ONLY / RELEASE HOLD.**

## User-provided live reproduction
DM trace from the latest READY diagnostic release: **10 grabs/10 commits, 73 approved steps and 1 blocked crossing**; no rejections, serial request median ~191–197ms, p95 Begin 272.2ms, Advance 232.5ms, Commit 249.2ms, signed visibility 347.2ms, renderer frame p95 0.1ms. Ten commit-triggered visibility RPCs, no `visibility.rpc-tail` or `visibility.queue` events. Player trace: `enabled:true`, **zero events and counters**, 256 frame timings p95 0.1ms. DM reports slight rubber-banding and viewer reports mild remote lag. These subjective symptoms cannot be assigned to one layer solely from these measurements.

The current code makes **one sequential Advance RPC per authorized gesture batch**, and the DM's 38-step held keyboard gesture required many round trips. Postgres cumulative `pg_stat_statements` (across releases and sessions, not same as browser RTT): Advance 754 calls mean 45.4ms / max 1534.2ms; Commit 317 mean 101.4ms / max 2765.8ms; Begin 373 mean 21.6ms / max 743.6ms; Visibility 956 mean 42.3ms / max 1856.5ms. Typical observed 190–200ms browser RTT therefore includes significant non-Postgres overhead, but network vs pool vs API transport remains unpartitioned.

## Supabase dashboard / free-tier concern
The designer also supplied a Supabase dashboard screenshot indicating resource concerns. Do not infer exact RAM percent, commitment, swap or billing from an unquantified visual or a single DB sample. A **read-only** spot check showed 29 sessions, 2 active, zero idle-in-transaction and database size ~25 MB; PostgreSQL shared-buffer activity reflected high historical cache-hit count. Supabase Performance Advisor at the same checkpoint had **36 unindexed foreign-key informational warnings, 7 unused-index informational notices and 2 multiple-permissive-RLS-policy warnings**. None of these alone diagnoses memory or justifies automatic index rebuilds, policy changes, VACUUM FULL, paid-tier upgrades, SQL reset or resource-raising flags. Any index tuning needs a precise slow-query plan and storage/lock budget. The R05 schema/migration drift remains a distinct release blocker.

## Scoped B10-R14 patch
The empty passive observer trace is structurally under-instrumented: production `RealtimeTransport.incoming` logs only *invalid* or exceptional packets. A normal approved private packet does not generate an event; even high volume of successful movement might leave the passive log empty. New opt-in, bounded, recipient-only trace:
- `observer.frame-accepted` once for a packet that passes strict map/viewer, sequence, revision, roster and payload checks.
- `observer.frame-gap` bounded p50/p95/max interval between **successive accepted private packets**, with the clock cleared at secure reauthorization/disconnect/dispose. Never count a permissions blackout as network jitter.
- No token IDs, map IDs, coordinates, path lengths, hidden-NPC identifiers, JWTs, private payloads or arbitrary errors. No extra Realtime subscription, database RPC, polling, requestAnimationFrame, storage or log upload.
- All movement timing, viewer permission, fog mask, collision, renderer, owner prediction, approved path interpolation and server-side authoritative SQL remain unchanged.
- Authenticated private packets are *diagnostic observations only*, never grants.

## Verification and rollout gates
Node tests for authorized packets, malformed viewer/unknown piece refusal, reconnect clock reset and idle channel with zero additional requests. Existing full unit/React Chromium, Vite, PostgreSQL 17 and CodeQL checks required at exact head. If approved for later live deployment, capture truly passive Player 2 trace after startup clear during 30–60 seconds Player 1 movement; verify `movement.grabbed=0`, `observer.frame-accepted>0` when visible, consistent `observer.frame-gap`, zero `observer.invalid-frame`, seals or sprite teardown. Capture moving actor's matching trace to distinguish server pace from observer delivery. A successful live test is still not equivalent to the protected 24-case DM/P1/P2 fog, wall and hidden NPC security matrix.

**Handoff:** B10-R14 staged, no production/database changes. Next B10-R15: use matched producer/receiver measurements and load/resource snapshot before considering any approach to sequential RPC overhead. Do not deploy R05's unreconciled multi-migration protocol as a performance experiment.
