# World Engine V2 — Phase 5 Private Multiplayer Motion Transport

**Date:** 2026-11-09  
**Branch:** `stage/world-engine-v2-2026-11-09`  
**Review PR:** #58 (DRAFT / WIP)  
**Status:** Implemented in staging with automated client and synthetic PostgreSQL tests; **not yet integrated into the live board or applied to production Supabase**.

## Purpose

Replace public or client-authored motion previews with one scoped, server-originated motion stream per viewer and map. Broadcast only already-validated ordered motion paths to recipients whose **current server permissions AND current authorized sight** permit them to see those paths. Preserve a strict separation between cosmetic observer motion, canonical database state and per-viewer fog/roster authorization.

The existing Phase 4 authority RPC validates gestures and collision before sending any preview. The Phase 5 observer wrapper runs in the same transaction as each successful, new movement batch. The *database*, not the browser, selects recipients, filters pieces and publishes to private channels.

## Source additions

- `src/engine/v2/RealtimeTransport.js`: receive-only private Supabase channel, viewer-scoped topic, strict payload validation, monotonic viewer sequence, duplicate/gap detection, full resync on reconnect/permission/version changes, fail-closed unknown-piece handling and lifecycle cleanup. No `send()` method.
- `src/engine/v2/ObserverPathBuffer.js`: bounded approved-route interpolation model; preserves every intermediate turn, rejects discontinuities, and is advanced only by the future WorldRenderer's **single shared animation-frame scheduler**. Hide and reconnect immediately clear pending motion.
- `src/engine/v2/index.js`: public V2 facade exports.
- `supabase/migrations/20261109100000_world_engine_v2_private_observer_stream.sql`: protected viewer sequence table, private Realtime receive-only RLS policy, viewer cursor RPC, recipient membership/map check, temporary per-viewer sight bridge and V2-only observer broadcaster.
- `tests/world-engine-v2-phase5.test.mjs`: JS protocol, anti-forgery, reconnect, order/gap, revocation, unknown NPC, snapshot and disposal tests.
- `tests/world-engine-v2-phase5-path-buffer.test.mjs`: pure observer interpolation regression tests covering wall-corner fidelity, multiple pieces in one frame, bounds, hide and reconnection.
- `tests/sql/world-engine-v2-observer-contract.sql`: synthetic SQL topic permissions, unauthorized broadcasts, partial concealment, actor/DM/map assignment, mixed group batching and monotonic stream cursor tests.
- `.github/workflows/staging-world-engine-v2-sql.yml`: Phase 4 and Phase 5 executed in disposable PostgreSQL 17 only.

## Server transport contract

Private topic: `forge-world-v2:{mapId}:{viewerId}`. Event: `world-motion-v2`. Both map and user are exact UUIDs.

Each packet contains only:

```json
{
  "version": 2,
  "mapId": "map-uuid",
  "viewerId": "recipient-uuid",
  "seq": 7,
  "environmentRevision": 5,
  "permissionGeneration": 3,
  "items": [
    {
      "action": "path",
      "kind": "token",
      "id": "visible-piece-uuid",
      "path": [{"x": 1, "y": 2}, {"x": 2, "y": 2}]
    },
    {
      "action": "hide",
      "kind": "tool",
      "id": "previously-visible-piece-uuid"
    }
  ]
}
```

```text
Phase 2 input → Phase 4 private authority ACK → Phase 5 recipient policy
                          ↓
          Real-time private database broadcast
                          ↓
           V2 viewer channel → revision/seq guard
                          ↓
          authorized roster gate → Phase 8 renderer
```

The payload contains no actor ID, token attributes, private NPC data, barrier IDs, raw scene, hidden position or destination for a concealed piece. Each authorized recipient gets **one combined packet per approved movement batch** with only the pieces it may see. The recipient sequence is scoped to that recipient/map, so gaps do not count movements of unseen pieces.

## Visibility and containment

- The server enumerates current campaign members and checks live map assignment on **every send**; a user remaining on an old WebSocket topic receives no further events after reassignment.
- DM recipients can see all physical unit movement, including explicitly DM-hidden pieces; players receive only visible, authorized paths.
- The current server-authoritative `forge_visibility.observer_verified_path_status` classifies each path: fully visible (path), origin visible but later concealed (hide without coordinates), or origin concealed (no event). This is a **temporary Phase 5 bridge**, and must be replaced by the independent V2 cached vision source in Phase 7. It is not permission for a local renderer to invent sight.
- Player clients cannot publish on the new channel. The migration grants `SELECT`-only Realtime topic RLS to the exact viewer/map. No `INSERT` policy is created for the V2 topic.
- All private viewer-stream tables and helper functions are protected by RLS plus explicit privilege revocations; the only public V2 observer RPC is `get_world_observer_cursor_v2`, which checks `auth.uid()` and the viewer's active/assigned map.
- The `client` only renders a path for a piece already present in its **fresh, authorized** roster. An unknown piece triggers resync rather than sprite creation. A hide instruction can conceal a known sprite but cannot be undone merely by receiving another path; refreshed server sight and roster are required.
- Version or sequence mismatch, malformed/private payloads, disconnect, map change or missing authorization fails closed. A resync is required before accepting new cosmetics.

## Ordering and reconnect

1. Establish one `private:true` channel after Supabase Realtime auth; no per-token channels.
2. On `SUBSCRIBED` or reconnect, invalidate all prior transient permission state.
3. Fetch a server-scoped viewer cursor using `get_world_observer_cursor_v2` plus an **authoritative RLS piece roster and fog snapshot** (to be delivered in Phase 7). The cursor alone never authorizes a sprite.
4. Adopt only exact map/viewer-scoped, increasing packet sequences in the same environment and permission generation.
5. Ignore duplicate/late packets. On missing sequence, unknown entity or changed permission/scene revision, revoke transient state and resync. Do not extrapolate a trajectory through unseen cells.
6. On disposal/map switch, remove the channel and abandon late in-flight responses.

### Phase 7 dependency — mandatory

The current client transport requires a caller-supplied `onResync(reason)` returning a verified snapshot with:
`version`, `mapId`, `viewerId`, `cursor`, `environmentRevision`, `permissionGeneration` and `visiblePieces`.

**Phase 7 must provide a coherent, server-authorized roster/sight/cursor acquisition path.** The Phase 5 `get_world_observer_cursor_v2` function returns only the server cursor and revisions. It does not return a roster, visibility grant or lighting changes. Do not connect this transport to the live React board until this missing integration is implemented and tested.

## Commit and cancellation boundaries

- Phase 5 observer motion is ephemeral and never writes canonical token/tool coordinates per tile or per frame.
- The Phase 4 transaction still authoritatively commits the end position once and preserves existing token/tool collision triggers during staging.
- A temporary backend wrapper moves the old Phase 4 `advance_world_motion_v2` into `forge_world_v2.advance_core_v2` and adds the new private broadcast after a fresh ACK. Replay is idempotent and never sends a duplicate broadcast.
- Phase 5 includes a pure **ObserverPathBuffer** that interpolates only approved adjacent points and never creates its own RAF, per-token timers or database writes. Phase 8 will drive this buffer inside its single renderer loop.
- **Cancellation/commit reconciliation** with stable sprite state is the responsibility of Phases 8–9. Until then, transport packets are not a substitute for canonical RLS snapshot reconciliation. Do not leave a cancelled ghost trajectory visible indefinitely in the final integrated engine.
- The final Phase 10 cutover must remove the Phase 4 legacy trigger GUC bridge, the Phase 5 `forge_visibility.observer_verified_path_status` bridge, old observer preview functions/queues and old private topic grants. The new V2 transport cannot become another permanent parallel runtime.

## Resource and free-tier limits

- 8 movement bend targets and up to 24 accepted cell transitions per validated batch, inherited from Phase 4.
- At most 32 audience recipients considered per batch; DM viewers are prioritized when the cap applies.
- At most 48 pieces in one group, packed into at most one message per recipient per approved batch. A viewer's private sequence requires one bounded row upsert per recipient/batch, not one canonical write per frame or tile.
- No Redis, paid Realtime add-on, second server or new production database is required. The existing included Supabase Realtime service provides private Broadcast.
- Supabase Broadcast uses the WAL and persisted short-lived messages. The final acceptance gate must benchmark actual WAL, memory, DB CPU, fan-out and observer latency with 2/4/8 clients and 10/50/100 pieces on the free-tier quota. Test fixtures passing is **not** proof of live throughput or latency.
- The temporary Phase 5 sight query may be computationally expensive with large, fogged groups. Phase 7 must replace repeated per-piece visibility evaluation with bounded dirty-region/per-viewer cached sight before production cutover.
- Supabase Realtime private channels require the security setting disallowing unauthenticated public-channel access if globally enforced privacy is desired. Review existing project setting at final staging validation; do not alter it during Phase 5 source staging.

## Verification and release gating

- [x] Inspect live private observer policy names and current server visibility function definitions (read-only).
- [x] Verify Supabase Realtime database Broadcast private/RLS requirements against current vendor documentation.
- [x] Implement recipient-filtered private broadcast and viewer-specific event ordering.
- [x] Implement strict viewer channel, unknown-entity suppression, reconnect/gap fail-closed behavior.
- [x] Add automated Node and disposable PostgreSQL integration tests.
- [ ] Check final staging commit with frontend tests, build, SQL fixture and CodeQL.
- [ ] Replace temporary legacy sight RPC dependency (Phase 7) and migration trigger bridge (Phase 10).
- [ ] Integrate stable rendering, cancellation/reconnect canonical reconciliation, player preview and dynamic moving-light fog.
- [ ] Run end-to-end live-client security and free-tier stress checks, then request one integrated release approval.

**No source changes to active `TabletopApp.jsx` or `BattlemapBoard.jsx`, no live SQL mutation and no deployment have been made in this phase.**
