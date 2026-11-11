# B10-R18-01 — Passive observer delivery failure: exact trace evidence and recovery contract

**11 November 2026, Australia/Melbourne.** Stage-only engineering record. Base: deployed R16 `main@90df8c960e79e8d66c322095611427da7bb09de4`. No live deployment, database write, schema/RLS/RPC/Realtime change, feature activation or paid infrastructure.

## Scope and verified evidence

Player 2 was a **passive observer**; the DM was moving in ordinary map mode. Player-preview movement remains DM-local and is excluded from cross-client comparison. User supplied Player 2's opt-in `window.__worldV2Trace.snapshot()` (bounded 256 event capacity), with:

| Viewer measurement | Recorded |
| --- | ---: |
| `observer.frame-accepted` | 51 |
| `observer.unknown-piece` | 2 |
| `observer.sequence-gap` | 2 |
| `observer.resync` / `observer.seal` / `renderer.seal` / `renderer.opaque` | 4 each |
| `renderer.sprite-remove` / `renderer.sprite-create` | 25 each |
| `renderer.fog-full` | 4 |
| `render.frame` p95 | 0.1 ms |
| `observer.frame-gap` p50/p95 | 249.3 / 1593.5 ms |
| `visibility.rpc` p50/p95 | 355.7 / 436.7 ms |

**Actual concealment windows:** `unknown-piece` at local 1,777,726ms until `observer.authorized` 1,778,118ms = **392 ms**; `sequence-gap` 1,778,299ms to 1,778,611ms = **312 ms**; `unknown-piece` 1,799,183ms to 1,799,540ms = **357 ms**; `sequence-gap` 1,801,394ms to 1,801,818ms = **424 ms**. Four user-visible blackouts, not a slow frame painter. The relative browser timestamps cannot be correlated directly to DM wall-clock events because clients have independent monotonic origins and the trace never logs private session IDs or positions.

The previously supplied DM trace, interpreted only as a separately captured browser view, had six successful commits, nine blocked keyboard steps, 40 Advance RPC calls (p50 250.7ms; p95 450ms) and six Commit RPC calls (p50 1065.9ms; p95 1870.2ms). These counts can explain perceived input lag; they do not prove any one DM gesture caused a particular Player 2 seal. The DM vs Player 2 **position discrepancy** is field reported but not yet proven via synchronized authoritative coordinates.

## Verified frontend behavior

Current `src/engine/v2/RealtimeTransport.js` accepts private observer frames only if their envelope, viewer/map identity, scene/permission generations, strictly adjacent routes, monotonic contiguous cursor and current server-signed roster are valid.

- `unknown-piece`: a well-formed private path referred to a piece not in the last signed viewer roster. Incoming path is NOT sent to `onPath`; the transport triggers `resync('unknown-piece')`.
- `sequence-gap`: a private frame's seq was not exactly cursor+1; the client never invents or interpolates missing segments, and resyncs.
- `resync` calls `seal`, clears the private roster/seq, and invokes `WorldV2TabletopRuntime.onRevoke` then `WorldRenderer.revoke`: map opacity, sprite removals and later full fog restoration. This exact mechanism matches all four live trace clusters. R16's bounded buffer `origin-mismatch` handling is not the cause in this new trace (no corresponding event occurred).
- Existing tests already demand strict fail-closed security for an unseen/unknown NPC, forged viewer, discontinuous packet and permission change. Do not replace either seal with a silent accept, allow a path to create a sprite, log private IDs/coordinates, or treat an observer packet as a grant.

## Verified installed live database behavior (read-only inspection)

- `forge_world_v2.publish_approved_observers` evaluates recipient-specific approved paths/hides, increments `forge_world_v2.viewer_streams.seq` per nonempty recipient frame, and calls `realtime.send` on the existing viewer-private `world-motion-v2` topic. A missing or delayed broadcast can leave a client behind the server cursor.
- `forge_world_v2.observer_path_status` and `observer_verified_path_v2` use viewer membership, token visibility, recipient LOS and per-waypoint checks. A route that passes those checks **does not itself establish** that this browser already has the corresponding signed roster entry. Treat unknown-piece as a signal to obtain new sight, not a right to render.
- `public.advance_world_motion_v2` publishes approved in-gesture paths without saving token/tool canonical positions. `public.commit_world_motion_v2` persists canonical x/y atomically. Current installed Commit has no separate post-commit private recipient sight invalidation.
- **Correction to earlier assumption:** `forge_world_v2.visibility_frame_v2` uses `forge_world_v2.piece_offset_v2` to include current valid active-session approved displacement in the signed `visiblePieces` coordinates. An Advance-era sight does **not necessarily** show the old database x/y. A stale-canonical race is possible under particular transition/expiry conditions, but is NOT confirmed as the cause of this trace. Diagnose it, do not assume it.
- The four observed sequence-gap/unknown-piece clusters alone do not distinguish lost Realtime delivery, a raced roster change, a cursor/roster snapshot race or a legitimate hide. No unauthorized NPC display or fog leak has been demonstrated.

## Existing work that must be reconciled before implementing a fix

- Draft **B08 PR #83**: nonapplied Commit reconciliation and per-recipient private terminal queue drain; exact Commit replay; delivery under budget and lost ACK.
- Draft **B10-R02 PR #87**: independent authenticated signed sight recovery under budget loss, single foreground-only watch, never a public cursor or client-chosen coordinates.
- Draft **B10-R03 PR #88**: retire unsent post-Commit coordinate-bearing private paths to prevent late old-route replay, preserving approved hides with their LOS/permission checks.
- Draft **B10-R05 PR #90**: migration-history-safe rehearsal and recovery. The remote Supabase migration catalog diverges from repo versions; never use indiscriminate `db push` or silently apply old candidate SQL.
- Current staged **R17 PR #102**: client-only keyboard rebase after a blocked server step, verified separately; does not repair observer convergence.

These branches are stacked on older code: **rebase and reconcile against CURRENT production R16** before any integrated proposal. Reuse existing methods rather than building a second movement authority or opening another socket.

## R18 incremental next steps and no-go release gates

**R18-01 (this change):** preserve synthetic, privacy-safe two-cycle incident reproduction in tests and exact findings in this document. This is an audit baseline, NOT a repair, and should merge only as part of a designer-approved consolidated release when needed.

**R18-02 (design and isolated implementation):** atomically reconcile after canonical Commit and support budget-independent server-signed viewer catch-up. Evaluate an authorized *terminal* cursor/roster signal with monotonic scene+permission binding, per-recipient fog/hide certification, a bounded source-side private publish budget, and the already-staged R02 source-of-truth fallback. Explicitly avoid exposing unknown-piece identity or mixing stale trajectories into a later signed canonical state.

**R18-03 (hostile QA):** isolated PostgreSQL source-real tests for same-actor multiple gestures, uncommitted/aborted move, exact retry, terminal packet loss, hidden NPC enters/exits LOS, private permission revoke, malformed/duplicate/out-of-order frame, deliberate missing seq, roster update between packet and sight, mobile/background reconnect, player tab duplicates and multi-token group. Validate eventual canonical convergence *even when the last private packet is dropped* and no subsequent gesture arrives.

**R18-04 (release qualification):** reconcile versioned migration with installed catalog and previous candidate branches; complete cross-account DM/P1/P2 protected fog + wall/door and hidden NPC security matrix. Measure p50/p95 browser RPC, observer cadence and full fog redraw count, server CPU/RAM, Supabase realtime message budget. No new paid plan, cron job, socket or polling storm.

**Release criteria:** no fabricated client positions, no unauthorized sprites/areas, exact current canonical endpoint after stable signed recovery, no continuous blackouts for ordinary authorized movement, no message replay/backtracking, automatic recovery after dropped terminal notifications, correct fail-closed behavior on genuine auth/permission loss. If any fail, NO-GO.

**Operator-facing QA improvement:** design an opt-in `Start Recording / Copy Diagnostic Report` in-app control for nontechnical testers, consuming only the existing bounded privacy-safe trace; avoid asking volunteers to type JavaScript or leak campaign IDs. Ship independently of the authority redesign after product/security review.

**Handoff:** R18 audit only, no production changes. Do not characterize R17 or R16 as complete observer synchronization fixes; do not deploy R05–R09 SQL unreviewed.
