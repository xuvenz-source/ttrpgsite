# Movement, fog, Realtime and memory redesign — verified implementation plan

Date: 2026-11-08
Production baseline: `main` / `9c66bde70fcf021ea1499adb52cd52fe77712e33` (PR #52).
Backend baseline: existing Supabase Free project, last applied migration `20261108091818`.
Staging branch: `stage/movement-fog-realtime-memory-redesign-2026-11-08`.
**Release state: staging only. No production SQL, deploys, paid branches or upgrades.**

## Observed evidence and caveats

- Verified Vercel deployment `dpl_BrVhvNBg6rzTNu7P5QRC93qdSWS3` is READY for the baseline SHA.
- On 2026-11-08 ~10:08 UTC, PostgreSQL reported 31 processes, 21 idle; 11 idle PostgREST sessions, max connections 60, DB ~17 MB. Physical RAM, swap, memory commitment and pool saturation have **not** yet been directly measured. These measurements alone do not establish a leak.
- Installed `public.preview_map_motion` delegates to the privileged `forge_visibility.dispatch_movement_preview`: per gesture sample it checks actor/map/piece, reloads scene obstacles, checks collision, writes private rate row, loops at most 32 recipients, calculates viewer path status and privately sends messages. `ObserverPreviewQueue` serializes calls per piece; this and the recorded ~368 ms average SQL statement cost are a plausible source of sparse remote movement.
- Installed `public.get_authorized_map_fog_v2` returns a per-user revision; installed `get_authorized_map_light_masks` returns a *global* revision. In `TabletopApp.jsx`, `useAuthorizedMapLights` compares its result to the per-user fog revision and discards valid masks.
- `useAuthorizedMapFog` calls `fogFrameDuringRefresh` on each genuine revision change, SUBSCRIBED event or viewer fallback. It empties permission-granting `visible` cells, while retaining only previously explored cells for rendering. This is secure but yields entity disappearance pending authorization.
- `TabletopApp.jsx` observer `hide` handling currently removes its hidden marker automatically after 1,350 ms, before a newer server-authorized reveal is guaranteed. A fix must separately recover legitimate visibility for stationary NPCs upon **newer verified** RLS/visibility revision.
- `BattlemapBoard.jsx` uses stable token IDs and imperative motion runtime, but rebuilding `visibleTokens` during sight invalidation can unmount art. `MapFogOverlay.jsx` already maintains a canvas and computes dirty cells; preserve it.
- Source-of-truth release ledger `staging/next-release-ledger.json` lists 35 released features; older three branches are superseded. Existing old open draft PRs are historical; do not cherry-pick over PR #52.

## Phase 1 — secure, stable frontend rendering (first release candidate)

1. **Lighting protocol parity:** Keep legacy `get_authorized_map_light_masks` unchanged. Add separately granted `get_authorized_map_light_masks_v2(uuid)` wrapping the existing authorized result with the viewer's server-owned revision and checking before/after viewer revision. Select v2 only after `get_authorized_map_fog_v2` has been confirmed, preserving protocol version through sanitization and snapshot retention. Unavailable/mismatched results remain unrendered; never use client radial gradients across walls. The SQL is staged as an unapplied candidate and backward-compatible migration prerequisite.
2. **Hard visibility-state boundary:** Separate a *confirmed* authorization frame from cosmetic explored-memory painting. `tokenObservedByFogFrame` and `BattlemapBoard` must always use currently authorized cells, not `displayVisibleDuringRefresh`. Only a new authorized reveal or revision-validated, RLS-reconciled snapshot may release an observer hidden marker. Do not simply extend a timer or trust an unsigned client message.
3. **Lifecycle reduction:** In `useAuthorizedMapFog`, use a clearly defined `confirmed/pending/revoked` state machine. Dedupe versioned ticks, avoid remounting the map on harmless subscription retries, and scope reconnect invalidation to actual authorization uncertainty. When uncertain, hide entities immediately but preserve explored terrain only.
4. **Render separation:** `BattlemapBoard`, `MapFogOverlay` and `TokenMotionRuntime` retain stable nodes and painter state on ordinary movement. Memoize token/monitor projection by token identity; keep private fog permission in an independent snapshot. Restrict full board refreshes to actual scene changes.
5. **Phase 1 tests:** No secret entities visible after hide, reconnect, switched map, stale tick, missing fog, light-RPC failure or out-of-order reveal; valid stationary NPCs recover only following confirmed later authorization. No token remount/full black flash for redundant tick. Verify fog-off, party vision, moving torch and wall-clipped lighting with 2 browsers.

## Phase 2 — server-validated movement sessions (after Phase 1)

1. Add a server-owned, short-lived gesture record or equivalent validated context in `forge_visibility` keyed to `auth.uid()`, piece, map and opaque random gesture ID. Store immutable actor and ownership checks, scene/geometry revision, persisted base, last approved waypoint, sequence, expiry and collision override eligibility. Only the server may supply authenticated context. RLS/private schema and EXECUTE grants must be audited.
2. Add versioned `begin_map_motion_session`, `advance_map_motion_session` and `end_map_motion_session` (precise signatures TBD after DDL review); keep `preview_map_motion` and `move_map_group` available for rollback. Validate ownership, DM override, map routing, boundaries and swept collisions on every accepted segment; guard one-way walls, doors, token footprints, tools and groups. Session invalidated by geometry, light, fog, ownership, map selection or permission epochs and TTL, including disconnects.
3. Use private per-recipient server-sent Broadcast only where server-issued authorization is enforced. Never send hidden-token coordinates, scene geometry or arbitrary actor-origin packets. Reuse recipient computation within a validated batch and early-reject stale waypoints; consider bounded updates independently of persistent writes.
4. `ObserverPreviewQueue.js` should become a session-aware latest-position queue with ack/sequence ordering and backpressure; `TokenMotionRuntime.js` continues immediate RAF rendering locally and interpolation remotely. Retain one authoritative final `move_map_group` trajectory transaction and explicit cancel/reconcile on dropped packets.
5. Phase 2 gates: open/closed/one-way doors, swept solid wall, authorized DM override, multi-token/tool groups, two simultaneous drags, stale coordinates, old session IDs and map-switch revocation. Measure p95 request-to-display; target <200 ms under normal test conditions. NO direct client broadcast of movement.

## Phase 3 — authoritative per-viewer sight deltas

1. Build on `map_viewer_visibility_ticks` from `20261108091818`. Add authoritative `epoch` (permission/map generation), increasing `revision`, base revision and a bounded delta/snapshot RPC. Include separate diff sets: visible+, visible-, explored+, authorized entity reveal/revoke, and light changes.
2. Server computes deltas from the current trusted visibility model, not client raycasts. Bind responses to `auth.uid()` and current map assignment; strip geometry and concealed entity identifiers until authorized. On revision gap, missing messages, invalid signature/context or reconnect: fail closed and request one complete authorized frame.
3. Share only validated per-scene wall, light and source intermediates across recipients where safe; invalidate at exact map/geometry/light/vision/owner dependencies. Never cache sensitive results across viewer identities.
4. Adapt `useAuthorizedMapFog.js`, `FogVisibilityContinuity.js`, `MapFogModel.js`, `MapFogOverlay.jsx`, `BattlemapBoard.jsx` and tool authorization to apply monotonic deltas without remounting unrelated art. Private observer `hide` must have an explicit newer server grant or reconciliation predicate.
5. Phase 3 gates: no unauthorized NPC/tool path, dropped/reordered tick recovery, party-vision expansion/shrinkage, torch through wall/around wall end, moving viewer, reconnect and hidden tab. Diff equals complete snapshot for identical server state.

## Phase 4 — free-plan query/memory performance

1. Before optimization, take repeated idle and 2/4/6–10-client stress snapshots: `pg_stat_activity` by application and state, `pg_stat_statements` top callers/mean/max/total, pool occupancy, temp spills, WAL, and Realtime events; collect Supabase dashboard committed memory **and physical RAM/swap** using available dashboard metrics. Distinguish reservation/commit from real pressure.
2. Count each per-gesture RPC, token RLS requery, fog/light RPC, tool refresh, tick publication and WAL write. Optimize high-cost calls with dependency-aware batching and bounded server-computed visibility, not speculative client grants.
3. Reuse already authorized scene computation within one RPC/gesture; index frequent lookups based on `EXPLAIN` and table stats, not guesses. Compare PostgREST idle baseline with live pressure before changing any connection cap or pool.
4. Keep budgets: Free plan only; avoid paid testing, external queues or new compute. Avoid WAL churn, unbounded caches, large JSON processing and new per-pointer writes. Never blindly lower `max_connections`.
5. Phase 4 gates: no unexplained sustained memory growth after repeated tests; substantial decrease in movement-related SQL call count and work time; unchanged security/RLS semantics and no increased error or connection queue rates.

## Consolidated verification/release gates

- Matrix: 2, 4 and 6–10 users; 10, 50 and 100 tokens. DM and player drags; simultaneous users, held torches, collision, doors, one-way geometry, fog on/off, party sight, hidden NPC visibility transitions, group movement, map switches, background/reconnect, dropped/out-of-order packets.
- Before/after: local RAF timestamp, remote move-to-paint p50/p95, number of node remounts/black full redraws, calls/move, SQL total time, WAL/temp memory, connection count, physical RAM, swap and committed memory.
- Required GitHub Actions: node tests, production dependency audit, Vite build, Deno checks, CodeQL. Static tests do NOT certify live multiplayer or Supabase permissions.
- Keep additive backend migration and rollback scripts; explicitly list role grants, EXECUTE policy, RLS, Realtime publication needs and dependency order. Apply production SQL **only with designer deployment approval**, coordinate with matching frontend, then one `main` release. Use existing test campaigns for live testing.
- Stop shipping if collision/fog authorization regresses, latency rises or source-of-truth reconciliation exposes a hidden NPC.

## Dependency / rollback ordering

- Phase 1 v2 light wrapper SQL *before* corresponding UI, with no legacy function replacement. Rollback UI first; v2 wrapper can be dropped after no callers remain.
- Phase 2 session SQL and permissions before activating client session mode; keep legacy flow as a version-gated fallback that must remain server authorized. Roll back client mode before dropping new functions.
- Phase 3 epoch/delta server functions and authoritative snapshots before enabling client deltas. Disable client deltas to fall back to the safe existing v2 full-frame path.
- Phase 4 measure first, tune last. Reversible index/config/cache choices only; no arbitrary max connection reduction.
