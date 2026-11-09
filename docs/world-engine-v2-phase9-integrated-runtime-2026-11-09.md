# World Engine V2 — Phase 9 Integrated Tabletop Runtime

**Date:** 2026-11-09  
**Branch:** `stage/world-engine-v2-2026-11-09`  
**Review:** Draft PR #58; cumulative Phases 1–9; **NOT deploy-ready**  
**Deployment:** NONE. All seven V2 migrations remain staged but unapplied. The existing live TableauApp/Board remains the default in Vercel.

## 1. Phase 9 scope

Connect Phase 2 input, Phase 3 prediction, Phase 4 server authority, Phase 5 per-viewer observer stream, Phase 6 immutable published scene, Phase 7 per-player fog/exploration and Phase 8 rendering through **one V2 presentation and gesture owner**. Keep the DM controls and unrelated gameplay services available without mounting the legacy movement/fog board simultaneously.

This phase stages an **alternative actual board**, not just more independent engine modules. It is compiled and testable in repository CI but gated off in the live deployment. It is **not yet a verified full in-browser or multiplayer replacement**, and unresolved cutover details are explicitly tracked below.

## 2. Newly staged implementation

| File | Engineering contract |
| --- | --- |
| `src/engine/v2/WorldV2TabletopRuntime.js` | Single map/viewer owner instantiates V2 scene manager+transport, private viewer visibility+transport, versioned authority, unified movement controller and input adapter. Handles actor/observer streams, approved movement, sight snapshots, scene invalidation, player map/role revocation and disposal without legacy movement RPCs or client-authored Realtime motion. |
| `src/engine/v2/WorldV2Board.jsx` | Alternative React board preserving map artwork, selected token/tool groups, pointer/touch/keyboard, pan/zoom, map drops, DM editor, pins, handouts, measuring tools, sheet open/quick/status actions, DM resize controls and combat-token decorations using the old app's callback API. Rendering positions are owned imperatively by Phase 8; token/monitor artwork is one React portal tree instead of per-token React roots. |
| `src/engine/v2/WorldCanvasStack.jsx` | Stable DOM/canvas layer stack accepts a single set of existing map overlay controls; fog layer stays above map-specific pins and measurement decorations. Renderer owner callbacks support revocation and sprite lifecycle. |
| `src/engine/v2/InputController.js` | Correctly preserves the relative pointer-grab offset on large tokens; supports release interception for tool placement onto a token, and shared keyboard input. |
| `src/engine/v2/WorldPinVisibility.js` | Handout pins are only interactive inside viewer-authorized visible fog cells, even if DM has globally revealed the pin. RLS still gates underlying handout content. |
| `src/engine/v2/WorldRenderer.js` | Renderer sprite-removal lifecycle for portals; explicit permission revocation does not recursively ask its own owner to reauthorize. |
| `src/MapPinLayer.jsx` | Optional pointer-scale mapping for pins in a CSS-zoomed V2 stage; legacy default 1 unchanged. |
| `src/TabletopApp.jsx` | Chooses **either** existing `BattlemapBoard` or lazily loaded `WorldV2Board` through two explicit environment keys. In V2 mode, old fog RPC/subscription, light-mask hook, legacy movement preview sender, observer socket and remote settle loops are disabled; unrelated campaign/tool/roster/chat subscriptions stay. Normal metadata refreshes no longer drive old coordinate preview rendering. |
| `src/useAuthorizedMapFog.js` | Optional default-true `enabled` gate disables legacy fog polling, RPCs and channel in V2 mode without changing legacy behaviour. |
| `supabase/migrations/20261109102000_world_engine_v2_vision_geometry.sql` | Prevents experimental DM preview V2 sessions from affecting any real viewer's sight/light offsets. **Still unapplied.** |
| `tests/world-engine-v2-phase9.test.mjs` | Mock-transport integration of scene, viewer cursor, private movement/hide, DM/player prediction, offset-correct input, tool hold release, commit, scene changes, fail-closed revocation, private DM preview, inactive cutover, pin fog filtering and legacy subscription gate. |

## 3. Release gate and compatibility

`TabletopApp.jsx` has this OFF-by-default double gate:

```js
const WORLD_V2_CUTOVER =
 import.meta.env.VITE_WORLD_ENGINE_V2 === 'integrated' &&
 import.meta.env.VITE_WORLD_ENGINE_V2_READY === 'true';
```

Both keys must be explicitly configured for the **same** reviewed release, **after** all V2 migrations, RLS and retirement work are verified. Neither key is added to Vercel settings by this PR. A missing/incorrect combination runs the existing tabletop. The app loads `WorldV2Board` only on V2 cutover and never mounts both boards at once. The old source remains present for rollback until Phase 10 removes it as part of the one integrated release.

The new runtime uses **only** `begin_world_motion_v2`, `advance_world_motion_v2`, `commit_world_motion_v2`, `cancel_world_motion_v2` for a real gesture. It never invokes `move_map_group` or directly writes `map_tokens` coordinates through React. It never sends a client-authored position broadcast. The private observer channel only *receives* server-filtered packets. Permitted entity IDs are exclusively supplied by the Phase 7 roster.

## 4. Runtime integration flow

```text
DM map publish (rare)
    → SceneTransport (single private map topic)
    → SceneManager.load() [published map, sceneGeneration]
    → WorldRenderer.adoptScene() [static cache/dirty regions]
    → VisibilityController.refresh() [new actor-owned sight]

Player or DM pointer/keyboard
    → one InputController
    → MovementController [instant grabbed; ordered bounded bends]
    → Phase 3 DM known collision or player no speculative hidden edges
    → Phase 4 authority RPC [begin/advance/commit]
    → WorldRenderer.applyLocalMovement() [stable sprite transform]
    → authorized fresh visibility after final commit

Other actor's movement
    → Phase 5 private observer packet + Phase 7 private vision notice
    → atomic VisibilityController snapshot [cells, roster, cursor]
    → WorldRenderer.adoptVisibility() [no sprite remount]
    → WorldRenderer.applyObserverPath()/Hide() [approved points only]
    → single WorldFrameScheduler [idle-aware RAF]

Map assignment, role or publication change
    → cancel gesture and revoke old paths/sight immediately
    → revalidate published scene and viewer-specific recipient roster
    → either adopt matching new grants or remain fully obscured
```

**No client-side pin, tooltip, hotbar, measurement or overlay can establish new sight.** Revealed handouts are filtered by authorized fog cells before becoming interactive.

## 5. Existing functionality preserved in the alternative board

Directly wired to the previous `TabletopApp` callbacks: character/Unit/NPC/tool map drops, tool-sheet double click, tool hold on token and pickup, alt+doubleclick sheet editing, token quick edit and status interactions, token monitoring, selected turn highlight, drag-select multi-token plus tools, DM token resizing, camera controls, DM map light/door/window editor, map handout pin editor/collector, measurement controls with turns, map publication status display and arrow-key movement only while the map is focused.

The surrounding sidebar, chat, campaign roster, combat tracker, sheet editor, inventory, hotbar, handouts and account settings remain rendered by the **same outer app**. Their background subscriptions are retained; only legacy position/fog observer paths are disabled when V2 is selected.

One React tree uses keyed `createPortal` for permitted artwork. Node coordinates, lifetime and authorization remain owned by `WorldRenderer`, not by token-position React state. Sprite nodes are detached immediately when the server sends a concealment packet. Token/item creation, map routing, footprint/owner/visibility and torch metadata changes cause a bounded authorization refresh; simple x/y changes do not rebuild the map or 500 React roots.

## 6. Discovered cutover risks and decisions

1. **DM preview moving vision** remains **READ ONLY in the new board**. The DM-only preview RPC returns the correct player-effective mask without persisting exploration, but the Phase 7 algorithm currently derives moving light/sight from real canonical/active sessions. A DM cannot join another user's private Realtime movement topic (JWT/RLS correctly forbids it). Do not fake that right or let preview coordinates contaminate live player sight. Phase 10 requires a separate actor-authorized, non-mutating preview sight source and collision-parity tests before enabling DM preview gesture movement. The existing live preview remains unchanged until cutover.
2. **Client prediction for ordinary players** still awaits bounded server-issued disclosed-edge/path grants for truly instantaneous fractional movement when collision is enabled. The Stage 9 engine deliberately denies prediction of hidden-wall geometry; it can stream batches immediately but a player may still wait on server ACK for the first ungranted crossing. Phase 10/final performance acceptance MUST close this user-experience gap rather than bypass wall security.
3. **Dynamic lighting appearance** is server-authoritative via Phase 7 fog masks but the V2 board's decorative torch radii are not yet the exact existing per-source light masks. Render attractive lights only after a viewer-safe, occlusion-clipped visual layer is integrated; otherwise a cosmetic glow could illuminate across a wall. Phase 10 must restore these effects with tests.
4. **Old outer subscription cleanup** is staged through explicit V2 cutover guards. The main app's shared campaign channel is retained for non-movement metadata; coordinate events under V2 must not drive the old renderer. The actual code deletion and remaining legacy SQL retirement belong to Phase 10.
5. **Browser parity** remains unverified: React portal targeting, event capture, selection shortcuts, sheet/status menus, DM editor, handouts, resizing, multiclient torch movement, reconnect and the interaction of CSS fog with pin hit-testing need visual and automated-browser QA. Synthetic Node/Vite build and PostgreSQL fixture do not establish identical browser behavior.
6. **RLS-authorized roster metadata** remains supplied by existing token/tool projections. The V2 renderer creates DOM sprites only for IDs granted by the Phase 7 snapshot; a private path packet never invents a hidden NPC. DM-only scene scope must agree with the server-authenticated sight scope; mismatch hard-revokes the old privileged scene.
7. **Free-tier profiling** remains mandatory. No new infrastructure was added, but approved-movement RPC CPU, per-viewer sight latency, channel count, server RSS, WAL and 2/4/8-client browser smoothness must be measured before release.

**Do not merge, enable flags, or deploy while any of these release blockers remain.** The current production tabletop retains all old capabilities.

## 7. Tests and next steps

- Node tests cover Phase 2–9 contracts and the new Stage 9 runtime and pin guard.
- Disposable PostgreSQL 17 workflow covers the seven staged V2 migrations and synthetic actors, authority, private observer, static map, sight, torch and cross-map access.
- Vite build validates the alternative JSX module and the two-key gate. CodeQL scans the staged branch. Verify status against the final commit rather than older green runs.
- **Phase 10**: implement preview virtual sight, safe fractional known-edge grants for players, occlusion-clipped dynamic light visuals, finish keyboard/DM/editor parity and remove legacy movement/fog runtimes/privileged functions including the Phase 4 GUC bridge.
- **Phase 11**: actual browser multi-client performance tests + stress; Phase 12 final conflict/security/free-tier readiness audit; Phase 13 one approved migration/deployment of the *entire* staged package.

**Staging status:** Phase 9 integration adapter and inactive application cutover are in Draft PR #58. Phase 9 is not permission to begin live testing or declare the redesigned engine performance complete.
