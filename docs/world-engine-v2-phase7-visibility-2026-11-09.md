# World Engine V2 — Phase 7: Independent Visibility, Exploration and Lighting

**Date:** 2026-11-09  
**Branch:** `stage/world-engine-v2-2026-11-09`  
**Review:** Draft PR #58, consolidated Phase 1–7 staging  
**Deployment:** NONE. No new V2 SQL applied to production Supabase; no Vercel deployment; active React tabletop unchanged.

## 1. Production contract verified read-only

The existing, authoritative data remains:
- `public.map_environments.live` — DM-published map, permanent walls/doors/windows/static light/fog settings, separate from unpublished `prepared`.
- `forge_visibility.map_rules` — current fog/collision enforcement; can change without `map_environments.revision` changing.
- `forge_visibility.exploration` — per-map, per-user permanently explored cells; JSONB numeric cell IDs and revision. Do not recreate history inside map or movement state.
- `public.map_tokens` and `public.characters` — owner and footprint/attribute-based sight sources.
- `public.campaign_tool_map_tokens` — loose and carried torches, with `light_bright`, `light_dim` and `held_by_token_id`.
- `public.campaign_player_maps`, campaign active map and existing role/map authorization.
- Existing legacy `forge_visibility.authorized_viewer_fog_frame`, `observer_verified_path_status`, `ray_blocked`, `is_lit` and `wall_passes` were inspected and compared. Their client dependencies are not suitable for a second simultaneous live runtime.

Authoritative sight is determined by each entitled token's center (at most 8 sources), a 12-cell maximum sight radius, effective attribute conditions, opaque walls, one-way vision, and illumination. Map ambient >=50 enables broad lighting; personal illumination remains bounded. Static and moving light reach is calculated from `(bright+dim)/5` cells. Light rays may pass through clear glass, but not solid walls or closed curtains. Doors/windows open or broken pass both rays. **No visible cell or NPC identity is trusted from client-authored geometry.**

## 2. New independent V2 database components (proposed, unapplied)

| Migration | Ownership |
| --- | --- |
| `20261109102000_world_engine_v2_vision_geometry.sql` | Private `vision_epochs` table with RLS and denied browser table access; independent V2 wall/door/glass/light ray tests, authoritative moving piece positions, sight/illumination checks and observer trajectory visibility classification. Replaces the **Phase 5 legacy fog helper** behind the V2 `observer_path_status` API. |
| `20261109102100_world_engine_v2_visibility_snapshots.sql` | One actor-scoped `get_world_visibility_v2(map)` RPC returning fog cells, explored history, authorized entity roster, approved stream cursor, environment/permission/scene revisions and vision epoch **coherently**; a DM-only `preview_world_visibility_v2(map,viewer)` returns player-effective sight without writing that player's exploration. |
| `20261109102200_world_engine_v2_visibility_invalidation.sql` | Light private `world-vision-v2` events on the **same viewer-specific Phase 5 socket**; movement-tied sight invalidation once per new approved batch (not duplicate ACK or per-tile canonical write); moving torches and held lights; light configuration/holder changes. |
| `20261109102300_world_engine_v2_vision_roster_invalidation.sql` | Token visibility/owner/footprint/map changes, new/deleted map tokens, party player map reassignment and campaign active-map changes invalidate affected viewers. Token x/y writes are excluded from the row trigger to avoid duplicate group-movement WAL. |

No migration publishes raw DM map geometry to a player, creates a per-cell Realtime channel, or introduces Redis / new paid infrastructure. Helper functions are in a private schema, with privilege revocations and secured role-bound public RPC grants. Private epoch storage uses RLS and is not directly readable/writable by authenticated browsers.

## 3. Snapshot contract

`get_world_visibility_v2` replies with:

```json
{
  "version": 2,
  "mapId": "map-uuid",
  "viewerId": "authenticated-viewer-uuid",
  "cursor": 5,
  "environmentRevision": 9,
  "permissionGeneration": 4,
  "sceneGeneration": 6,
  "visionEpoch": 7,
  "enabled": true,
  "width": 10,
  "height": 10,
  "partyShared": false,
  "visible": [11, 12, 21, 22],
  "explored": [10, 11, 12, 21, 22],
  "visiblePieces": [
    {"kind": "token", "id": "authorized-token-uuid", "x": 2, "y": 2}
  ]
}
```

The response excludes walls, hidden/light source coordinates, secret door conditions, character sheet/NPC attributes, exploration from unrelated users, and raw visibility calculations.

- **`visible`**: current authorized per-viewer cells; moving a token changes this mask without reloading the published map.
- **`explored`**: persistent historical cells in `forge_visibility.exploration`. When nothing new is explored, there is no exploration UPDATE/WAL write. When party sharing is published, explored history is the permitted party union.
- **`visiblePieces`**: roster of entities currently authorized for the viewer, including their latest server-approved transient/canonical position; no hidden NPC appears solely from a broadcast.
- **`cursor`**: this viewer's private movement sequence, acquired in the *same snapshot* as sight and roster so Phase 5's reconnect guard can safely unlock.
- **`environmentRevision` / `sceneGeneration` / `permissionGeneration` / `visionEpoch`**: distinct guards for published scene, rule/permission changes and moving vision, with out-of-order or revoked frames rejected.

No client has an API to publish authoritative sight or set an exploration state. DM preview delegates to the server's player-effective view and never changes the player's explored history.

## 4. Client ownership and draw contract

- `src/engine/v2/VisibilityFrame.js` validates strict reply keys and types, sorts/limits cell IDs, rejects invalid viewer/epoch/roster data, and converts authorized cells into a compact trinary fog mask: 0 unseen, 1 explored, 2 visible.
- `diffWorldFogMasks` returns dirty row rectangles; `diffWorldVisiblePieces` preserves stable keyed sprite identity. Unchanged fog does not trigger another full redraw or React remount.
- `fogEdgeWeight` supplies a **purely visual** soft boundary within already-visible cells; it never reveals or authorizes an extra cell. Phase 8 owns the canvas and effect styling.
- `src/engine/v2/VisibilityController.js` owns one viewer/map's frame, stale-response rejection, permission revocation, DM preview, latest fog mask and entity roster. No independent animation loop or wall geometry access.
- `src/engine/v2/RealtimeTransport.js` now handles both motion and lightweight `world-vision-v2` notices on the same pre-existing private channel, **not one socket per token or per map cell**.
- `VisibilityController.observerSnapshot()` is the atomic roster+cursor provider required by the Phase 5 `onResync` contract, closing that staging dependency.
- The background remains static from Phase 6; fog masks refresh on a genuine authorization/vision change only, and sprite identities do not flicker on token movement.

All these interfaces remain isolated; the current production board is **not** yet using V2. Actual renderer/fog shader integration is Phase 8.

## 5. Live lights and authorization

The server computes light rays through the published environment. A placed torch uses its authorized issue position. A held torch uses the holder token's canonical or current approved V2 session position. This also works when the DM moves a player's token. Only recipients with affected sight receive a lightweight versioned invalidation (no torch coordinates). Light enablement/radius/holder changes do not republish static map geometry.

The private movement observer function now uses `forge_world_v2.observer_verified_path_v2`, not `forge_visibility.observer_verified_path_status`. Fully visible paths may be sent to entitled recipients; transition into concealed territory yields a generic hide without concealed coordinates; origin concealed yields no path. Hidden NPC roster exposure is independently gated by the atomic viewer snapshot.

**Security regression discovered and resolved:** a Postgres SQL `NULL <> 'player'` comparison does not return true and previously could fail open for an unassigned player. All V2 sight/roster notification gates now use `IS DISTINCT FROM 'player'`. Disposable SQL tests verified a reassigned viewer receives no previous-map signal or sight grant. Party-shared sight likewise excludes sources whose owners are assigned elsewhere.

## 6. Limits, performance and free-tier behavior

- Published map walls/lights are static and compiled per publication by Phase 6; vision snapshots do not update map environment rows.
- Fog-enabled authored maps are bounded to 128×128 cells and at most 8 entitled vision sources. Candidate cells are generated near these source centers, not by scanning the entire map without sources.
- Fog-disabled larger maps remain supported: their roster is visible without allocating a giant empty fog bitmap.
- Up to 60 static lights and 50 placed/carried torches are evaluated with conservative errors. Player visibility defaults to none if authoritative geometry/lighting is malformed.
- Epochs advance only on relevant movement or authorization changes, and explored history changes only when genuinely new cells are discovered.
- The private scope uses existing Supabase Postgres and Realtime, with bounded per-viewer notifications and no per-cell network traffic.
- **Still unmeasured until integrated load tests:** DB CPU for many sources/lights, time-to-fog-update under 2/4/8 clients, Supabase RSS/WAL/Realtimes on the free tier and frame-to-frame visual smoothness. The Phase 8–11 release gate must measure these rather than infer performance from synthetic tests.

## 7. Verification

Staged tests:
- `tests/world-engine-v2-phase7.test.mjs` (17 direct frontend regression cases plus Phase 5 private-channel compatibility tests).
- `tests/sql/world-engine-v2-vision-fixture.sql` and `tests/sql/world-engine-v2-visibility-contract.sql` against disposable PostgreSQL 17 after all Phase 4–7 staged migrations.
- Real SQL tests for opaque walls, transparent windows, curtains, DM preview not writing exploration, player/DM hidden NPC privacy, moving torch held by a DM-moved player token, party-shared sight across walls, map reassignment revocation, large fog-disabled maps, idempotent visible/explored revisions, light setting changes, private notice content and zero remaining legacy fog-path call in V2.
- Full repository frontend tests, Vite production build, dependency audit, Deno/Edge checks and CodeQL security scan. The integration branch was green before this documentation update; verify again on final commit.

## 8. Mandatory work before any live release

1. **Phase 8:** Single stable renderer RAF; separate terrain/static/environment and fog layers, efficient dirty canvas updates, token sprites with stable React keys, smooth allowed-path interpolation and reconciliation. Optional weather/soft fog must not affect authorization.
2. **Phase 9:** Integrate all DM/player/token/tool/party-movement/keyboard/preview/map-switch cases in one runtime. Wire scene, V2 movement authority, private observer channel, and atomic `VisibilityController.observerSnapshot()`. Keep existing unrelated gameplay functionality.
3. **Phase 10:** Retire old movement/fog/observer UI and privileged SQL paths, **remove Phase 4 compatibility GUC bridge**, drop obsolete grants/exports and ensure the Phase 5 legacy fog function is no longer referenced anywhere in V2 or live routes.
4. **Phase 11–13:** Full browser/permission/perf/free-tier stress and security checks, final all-components staged deploy gate, explicit approval and **one fully integrated release**. Do not push these migrations to live Supabase individually.

**Current status:** Phase 7 staging and isolated tests complete; no production migration, main merge, staging-site deployment, or live client wire-up.
