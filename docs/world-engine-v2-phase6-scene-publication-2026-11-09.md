# World Engine V2 — Phase 6 Published Scene, Environment and Static Cache

**Date:** 2026-11-09  
**Branch:** `stage/world-engine-v2-2026-11-09`  
**Review:** Draft PR #58, integrated work in progress  
**Environment:** GitHub staging + disposable PostgreSQL 17 fixture only. **No production Supabase migrations or Vercel deployment.**

## 1. Existing behavior verified (read-only against live Supabase)

The current source of truth is already persisted **per map**:

- `public.map_environments.prepared` — saved DM/editor draft.
- `public.map_environments.live` — published environment used by the server.
- `public.map_environments.revision` — increments on a successful publish.
- `forge_visibility.map_rules` — published fog/collision enablement and rules timestamp.
- `public.battle_maps` — map dimensions, grid size and image metadata.
- `forge_visibility.exploration` — persistent per-viewer exploration, **not** a property of the shared environment object.

Current `public.publish_map_environment(map,action)` is DM-only. It validates prepared objects (maximum 120 objects; maximum 2,500 barrier points; 80 points per barrier, at most 128 fog cells per axis), writes `live=prepared`, increments `revision` and changes rules under a transaction-level advisory lock. The `disable` action changes published fog/collision rules but **does not increment** environment revision. The `reset_exploration` action changes exploration, not the static scene.

**Design choice:** Preserve the established prepared/live map persistence and reuse its tables. Never duplicate an entire scene per token, movement, observer or viewer. Scene generation is a small **publication signal**, not a second environment store.

## 2. Staged implementation

| File | Responsibility |
| --- | --- |
| `src/engine/v2/SceneSnapshot.js` | Validates/sanitizes server-authorized, immutable published snapshots. Derives bounded dirty regions for barrier, door and static-light changes. |
| `src/engine/v2/SceneManager.js` | One active map/identity scene owner; deduplicates in-flight fetch, caches compiled collision and static display independently, guards stale revisions and map changes, supports explicit authorization revocation. |
| `src/engine/v2/SceneSpatialIndex.js` | Builds bounded, deterministic spatial buckets once per static revision. Falls back to full segment scanning on overflow, never skipping blockers. |
| `src/engine/v2/SceneTransport.js` | A single receive-only private channel per map for publication generations. Only genuine publish/rule changes trigger resync. Reconnect refreshes persisted generation without polling/token subscriptions. |
| `src/engine/v2/CollisionSolver.js` | Uses spatial queries when available, with original full-scan collision semantics as the safety baseline. |
| `src/engine/v2/index.js` | Exposes Phase 6 V2-only interfaces. |
| `supabase/migrations/20261109101000_world_engine_v2_static_scene_publication.sql` | **Unapplied** SQL: minimal `forge_world_v2.scene_publications` generation table; DM-publish-only and rule-only triggers; private scene-notice Realtime RLS; `get_world_scene_v2` authenticated RPC. |
| `tests/world-engine-v2-phase6.test.mjs` | Strict viewer payload tests, immutable DM object tests, dirty-region tests, collision-index parity, no token-churn rebuild, reconnect and map/permission revocation tests. |
| `tests/sql/world-engine-v2-scene-fixture.sql` and `tests/sql/world-engine-v2-scene-contract.sql` | Disposable PostgreSQL role/privacy, prepared/live persistence, notification, map reassignment and static invalidation tests. |
| `.github/workflows/staging-world-engine-v2-sql.yml` | Runs all Phase 4, 5 and 6 synthetic SQL tests in one disposable PostgreSQL 17 environment. |

**All active UI entrypoints remain untouched.** There is no second engine running alongside the live React board.

## 3. Server RPC and privacy contract

`get_world_scene_v2(p_map)` verifies `auth.uid()` and the existing `can_view_campaign_map` and `is_campaign_dm` permission functions. It returns a versioned publication manifest:

- `mapId`, `revision` and `sceneGeneration`.
- `rulesRevision`, `published`, `fogEnabled` and `collisionEnabled`.
- Grid metadata, safe ambient percentage and weather/effect intensity.
- `scope:"dm"` plus the full **LIVE** environment for an authenticated campaign DM.
- `scope:"viewer"` plus `environment:null` for an ordinary player, **always**.

No player response contains private walls, door conditions, light positions, raw fog rays, hidden NPC IDs, unpublished `prepared` data, or light-layer editing state. A player can render permitted map-wide ambient/weather styling but must obtain **viewer-specific sight and disclosed movement grants** in Phase 7. Scene metadata is not a visibility authorization.

The private notification topic `forge-world-scene-v2:{mapId}` emits only `{version:2,mapId,sceneGeneration}` using a database-originated `realtime.send`. Subscribers require the existing assigned/active-map authorization. The migration has no authenticated/anon INSERT policy for this V2 topic, so browser users cannot legitimately publish scene-generation messages.

## 4. Generation and invalidation rules

- **DM edits `prepared`:** saved to the map, no publication generation change, no scene notification.
- **DM publishes `live`/environment `revision`:** generation increases, scene notification sent.
- **DM toggles fog or collision rules:** generation increases **even if environment revision remains unchanged**.
- **No-op updates of unchanged fog/collision booleans:** no scene-generation change.
- **Token/tool movement, combat, inventory or sheet changes:** no scene-generation write, no static cache reload.
- **Map switch / viewer identity switch:** prior scene and collision compilation are discarded.
- **Authorization explicitly revoked:** cached secret DM scene is erased; stale collision/vision grants are not retained.
- **Reconnect or a missing scene event:** query the latest persisted generation; in-flight older responses cannot override a newer publication.
- **Malformed scene:** reject and fail closed instead of treating a missing barrier as passable.

The original `map_environments.live` data is persistent by map. A client may retain an existing static background temporarily during refresh to prevent a black flash, but cannot use invalidated geometry for movement prediction until revalidated. Current authorized vision/moving lights remain a separate security domain, not part of the scene cache.

## 5. Scene acceleration and dirty rendering

A published full-DM scene compiles deterministic barrier segments and an index of spatial buckets. Collision sweeps query only nearby barriers when the index fits the memory budget. Excessively broad geometry/bucket counts trigger a conservative full scan — **never** a permissive empty result. Existing Phase 3 swept-footprint collision remains unchanged in meaning.

For a door or static light edit, compare authorized published objects by ID and derive affected geometry/light-radius rectangles. Fog enablement, ambient/weather, dimensions and collision rule changes cause full static-layer invalidation. This is a **dirty-region metadata contract** for the Phase 8 renderer, not a new draw loop: there are no per-token animation timers or whole-map React remounts in these modules.

Repeated scene fetches at identical revisions retain the same compiled collision identity. No per-movement geometry compile or hidden-world network fetch is introduced.

## 6. Security and free-tier constraints

- One tiny scene-generation row per map, updated only on publication/rule changes.
- One private map topic for publication notices, not per piece and not per grid cell.
- Prepared/live editor data still protected by existing DM-only RLS.
- The V2 scene publication table enables RLS and denies anon/authenticated direct reads and writes. The public scene RPC is explicitly limited to authenticated users with map-access checks.
- Private database trigger functions have EXECUTE revoked from client roles; no service-role credentials enter the browser.
- No Redis, paid server, extra environment, new database project or recurrent scene polling.
- Realtime Broadcast remains WAL-backed; benchmark memory, WAL and live latency during the integrated acceptance gate. Passing synthetic tests does not establish free-tier production performance.
- A DM publish can create two small generation notifications (one environment, one rules change). This is infrequent; the client coalesces concurrent fetches and uses the latest generation, but optimization of burst publications remains a final performance concern.

## 7. Phase integration requirements

**Phase 7:** Rebuild viewer-specific sight/exploration, shadow and light masks using published environment revision plus scene generation, and a coherent authorized roster/cursor. Static light objects are not user-shared geometry; moving carried lights must follow authorized piece positions. Replace the temporary `forge_visibility.observer_verified_path_status` dependency used by Phase 5 and ensure scene notifications cannot accidentally re-authorize hidden NPCs.

**Phase 8:** Drive approved observer-path interpolation through a single stable frame scheduler. Consume the Phase 6 dirty-region metadata without remounting the terrain, token sprites, fog surface or lighting canvas.

**Phase 9:** Integrate new scene manager, token movement, tool movement, map switching, DM preview, editor publish and unrelated functionality into one runtime. No overlapping old/new scene subscriptions.

**Phase 10:** Replace the temporary Phase 4 legacy collision trigger GUC bridge; remove legacy movement/fog runtimes and unused privileged SQL; verify all remaining RLS/role constraints before the single integrated deployment.

## Verification record

- [x] Read-only live prepared/live/rules publishing contract check.
- [x] Staged scene storage/revision RPC and secure private publication signal.
- [x] Pure immutable snapshot, static cache, spatial acceleration and transport implementation.
- [x] Tests for no-reload on token edits, persist-live-only publish, fog disable, DM/player privacy, map switch, reconnect and collision parity.
- [x] PostgreSQL 17 fixture validation of Phase 4/5/6 migrations and actor access.
- [x] Repository frontend tests/lint/Vite build on the implementation commit.
- [ ] Final CodeQL scan and integrated 2/4/8-client browser, scene editor and memory tests.
- [ ] Phase 7/8/9/10 integration and legacy retirement.

**Release status:** Draft PR #58 only. Phase 6 SQL has not been applied to live Supabase, and production/staging site deployments have not been changed.
