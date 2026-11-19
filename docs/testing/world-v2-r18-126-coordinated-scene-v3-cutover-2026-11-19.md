# R18-126 — Coordinated V3 scene publisher and receiver cutover (SOURCE-ONLY)

**19 November 2026 (Australia/Melbourne).** Direct child of R18-125 draft PR #233, parent commit `bce0495099b07a9d093c14f7695befa99839ef49`. **PRODUCTION NO-GO.** This package does not edit `src/`, create a versioned migration, access paid infrastructure, apply hosted SQL, merge or deploy.

## Exact original read-only baseline

The current `forge_world_v2.bump_scene_publication_v2(uuid)` returns a `bigint` and atomically inserts/increments `forge_world_v2.scene_publications` with `ON CONFLICT (map_id)`; it then emits one map-wide Realtime Broadcast to `forge-world-scene-v2:<map>` using the `scene-revision-v2` event. It is invoked by exactly two read-only-catalog-observed trigger call sites: `world_v2_environment_published` on published `map_environments` and `world_v2_rules_published` on `forge_visibility.map_rules`. The current V2 Realtime receive policy is named `World V2 scene publication receive`.

R18-125 already defines private viewer/map epochs, the `get_authorized_scene_channel_v3` signed-user proof, the `can_receive_scene_topic_v3` RLS predicate, and the server-only `current_recipient_scene_topic_v3` resolver. This depends on the full inherited R125 schema and must not be independently installed.

## Source-only R126 server candidate

The unapplied SQL file atomically introduces the recipient-scoped Realtime `SELECT` policy, **drops** the old shared scene receive policy, and replaces the existing counter publisher without changing its signature, return type, event name, generation fields or persisted scene-counter ordering. Each notification is sent to a currently authorized recipient's existing opaque V3 epoch topic. If an authorized player has no epoch yet, no push is emitted; the authenticated scene generation is read when they join or reconnect. The sender has **no legacy V2 channel fallback**.

Only `mapId`, `sceneGeneration` and `version` are published—not wall geometry, fog, character positions, sheet fields, or asset paths. The server-only recipient resolver holds `FOR SHARE` on the membership row through the `realtime.send` call, so a concurrent membership DELETE must synchronize with the publish transaction. A controlled failure for one recipient is caught without rolling back the persisted generation or aborting sends to others. This is not proof of ordering or delayed delivery in hosted Realtime.

The SQL explicitly revokes direct `EXECUTE` on the publisher for anonymous and authenticated roles, and grants only a narrowly scoped future `realtime.messages` select policy to signed users. **The existing old socket may remain connected after the policy is dropped; it becomes quiet only after all old publishers are retired.** No live socket disconnect claim is made.

## Source-only R126 client candidate

`SceneV3Transition.js` is a dormant standalone module deliberately outside `src/`. It checks the fresh signed identity via `db.auth.getUser()`, issues `get_authorized_scene_channel_v3` exactly at entry/reentry, verifies exact map + viewer + epoch topic, then subscribes privately with `scene-revision-v2` as an invalidation event. It synchronously invokes the host-provided view/input mask before any authentication or network work, and reveals only after a server-authorized `sceneManager.load()` completes with nonstale data. Reconnects, denied reads and late async responses never grant old context. Old channel subscribers are explicitly removed. No periodic timer, movement event RPC or fallback to `forge-world-scene-v2` is present.

**Important limitation:** This adapter is NOT mounted in the existing V2 React tree. The real R123 sentinel, full campaign cache and artwork teardown, fog/observer privacy, and independent Realtime/Postgres Changes cleanup must be connected and reviewed before any production use. A client returning an asynchronous or ineffective mask violates its security contract.

## Disposable PostgreSQL 17 verification

The test runner uses the synthetic R125 campaign/map/membership fixture, a synthetic Realtime broadcast log and `realtime.topic()` selector, the inherited R125 SQL, and the unapplied R126 SQL. It checks current P1/P2/DM notifications, exact per-recipient RLS, no old map-wide messages, old policy drop, removal cascade, post-removal P1 silence, unaffected P2 delivery, reinstatement epoch rotation, map reassignment, simulated Realtime failure, generation continuity and direct function/table ACL denials. Source tests exercise view mask ordering, authorization before reveal, stale callbacks, wrong topic/identity, no movement polling and no V2 fallback.

This synthetic setup does **not** test actual Supabase Realtime WebSocket servers, `realtime.send` delivery delay, CDN URLs, the original private 83 migration bodies, real signed DM/P1/P2/outsider accounts, service_role removal/update/TRUNCATE, or concurrent removal under real load. Do not describe these as passed.

## Coordinated production transition remains blocked

One SQL transaction cannot atomically replace already-loaded browser bundles and the live database. A future release must prepare a guarded client/server feature-negotiation or controlled maintenance cutover first. A DB-first cutover would break legacy V2 scene notification delivery; a client-first cutover would fail when V3 RPCs are missing. Neither should silently fall back to the insecure old shared scene channel. A graceful, rollback-safe, *fail-closed* plan must be proven in isolated signed QA before approval. Deployed clients with old subscriptions must be masked and refreshed at the transition boundary.

The R18-125 epoch grants are durable only until actual membership deletion; subsequent reinstatement gets new epoch. A map reassignment revokes the right to read the previous map, but does not necessarily rotate the epoch while the person remains a campaign member. Scene notices do not replace authoritative scene/fog RLS checks.

Performance needs dedicated measurement of per-recipient publication costs, subscription lifecycle, Postgres lock contention, Realtime quotas/egress, client cold join and map refresh. Do not add authorization calls to movement, dragging, fog rendering or frame loops. Signed Storage bearer URLs are independently valid after revocation and require the separate #231 fix and exposure-window policy.

Open gates: #220, #223, #229, #231; R18-104 fog metadata; R18-114 inventory UUID; all 67 privileged authenticated RPCs; full private 83-SQL migration body review; QA bootstrap approval; real signed DM/P1/P2/outsider tests; cutover orchestration; performance; explicit production approval.

**Manual work needed now: none. Production NO-GO.**
