# World Engine V2 — Phase 8 Unified Rendering Engine

**Date:** 2026-11-09  
**Branch:** `stage/world-engine-v2-2026-11-09`  
**Review:** Draft PR #58, Phase 1–8 cumulative staging  
**Release status:** No Vercel deployment, no main merge, and no staged V2 SQL applied to production Supabase. The live tabletop still uses the legacy renderer until Phase 9 integration and the one approved cutover.

## 1. Purpose and old-renderer audit

The legacy `BattlemapBoard.jsx` mounts React sprite nodes with several motion/fog refresh dependencies. `TokenMotionRuntime.js` currently includes a shared RAF, per-piece presentation previews and post-commit settle timers; it also has a separate renderer/route ownership model from player fog, map-editor static geometry and `MapFogOverlay.jsx`. The old fog component already attempts dirty-cell painting, but the Phase 7 V2 authorization/roster/cursor protocol needs a single rendering owner.

Phase 8 creates a genuinely separate, independent V2 presentation implementation, not another patch on `TokenMotionRuntime`. It does **not** import `BattlemapBoard.jsx`, `TokenMotionRuntime.js`, `MapFogOverlay.jsx` or old fog geometry/RPC components. It is not mounted by `TabletopApp.jsx` yet.

## 2. Implementation (staged)

| Component | Ownership |
| --- | --- |
| `src/engine/v2/WorldFrameScheduler.js` | The **only** requestAnimationFrame scheduler for a mounted V2 board: wake on local motion/approved observer routes; coalesce dirty work, stop when idle, clamp delta after tab suspension, cancel on disposal. No additional timer per piece/fog layer. |
| `src/engine/v2/WorldLayerPainter.js` | Bounded, persistent static/environment and fog canvas painters. Fog paints changed cells and one-cell feather neighbours. All gradients stay *inside already-visible cells*. Dynamic light and unknown geometry never enter the player client. |
| `src/engine/v2/WorldRenderer.js` | The unified imperative presentation store: exact map/viewer-scoped published scene, atomic Phase 7 sight/roster/cursor, stable per-piece nodes, authorized remote path buffer, one local held-gesture display, identity/permission revocation, snapshot handoff, CSS camera transforms and perf counters. |
| `src/engine/v2/WorldCanvasStack.jsx` | A stable React mount contract with persistent sibling layers: map terrain image, static DM environment, sprite layer and fog canvas. No token-position useState, client subscriptions or second RAF. **Not imported into the active tabletop**. |
| `src/engine/v2/ObserverPathBuffer.js` | Reconciles new server roster positions without discarding a still-approved remote path, including an older canonical origin while interpolation is ongoing. Refuses shortcuts or unknown waypoints; resets animation timestamps after suspension. |
| `src/engine/v2/RealtimeTransport.js` | Passes the authenticated viewer's motion sequence metadata to both `onPath(item,meta)` and `onHide(item,meta)`. Hiding removes a sprite immediately and cursor gates prevent stale roster resurrection. |
| `src/engine/v2/VisibilityController.js` | Adds `onSnapshot(frame)` callback for **every** valid atomic sight/cursor refresh, even if no fog/roster pixels changed. The renderer can update its cursor without scheduling an idle RAF. |
| `src/engine/v2/VisibilityFrame.js` and Phase 7 SQL | Explicit backend-issued `scope:"dm"|"viewer"` in authorized sight response. Renderer verifies it matches the fresh published scene (except DM's explicitly requested player preview). Role or permission change hard-revokes cached DM geometry. |
| `tests/world-engine-v2-phase8.test.mjs` | Deterministic scheduler, fake-canvas and fake-DOM regression tests for sprite identity, fog authorization, size, bends, group movement, local handoff and concealment. |
| `tests/world-engine-v2-phase8-jsx.test.mjs` | Uses Vite's JSX transformer to verify the stable React layer stack compiles without adding a second animation loop. |

No new backend service, worker, Redis, second database, per-piece subscriptions or paid plan features are introduced in Phase 8. Phase 7's staged visibility snapshot migration was amended to include the authorized role scope; the migration remains unapplied.

## 3. Persistent layer composition

The eventual `WorldCanvasStack` is a **single mounted DOM subtree**:

```text
WorldCanvasStack (one React mount)
└─ world-v2-stage     ← camera transform (CSS only)
   ├─ terrain img     ← map image source changes ONLY on map/asset switch
   ├─ static canvas   ← published DM walls/doors/lights, authorized scope only
   ├─ sprite host     ← stable token/tool nodes, keyed by kind + UUID
   └─ fog canvas      ← server-authorized visible/explored/hidden mask
```

The renderer updates the native `translate` CSS property of previously authorized sprites instead of remounting or committing a React render on every cell. Existing sprite-specific CSS `transform` and inner artwork may continue to be managed by the future app adapter.

Canvas backing dimensions are bounded: static scene canvases at most 2048×2048 pixels; fog at most 128×128 cells rendered at configurable 2–16 pixels per cell. Large maps with fog disabled use a **single 1×1 transparent canvas**, not a full-size fog allocation.

DM-only static barriers and authored light guides draw at scene publications and explicitly invalidated regions, not token movement. Player scope has no raw barrier/light objects and cannot draw secret guides. No flicker or weather effect is permitted to change authoritative fog masks.

## 4. One frame scheduling and frame work

The shared scheduler processes, in this order:
1. Pending published-scene guide repaint, if any.
2. Pending authorized fog dirty regions, if any.
3. All approved observer-route interpolation steps in the one buffer tick.
4. Changes to mounted sprite CSS positions only for dirty pieces.

Idle snapshots with unchanged masks and roster update the private stream cursor but request **zero** frame callbacks. Multiple simultaneous tokens/groups request one animation callback per frame, not one per token. Paused tabs do not extrapolate a large elapsed duration on resume.

Metrics exposed by `renderer.stats`: `frames`, `spritePaints`, `spriteCreates`, `spriteRemoves`, `fogDraws`, `fogPaintedCells`, `fullFogDraws`, `staticDraws`, `terrainAssignments`, `rejectedPackets`, active `sprites`, observer pending points and scheduler request/cancel counts. These provide deterministic performance instrumentation for Phase 11; they are not themselves live latency measurements.

## 5. Movement and position handoff

**Local owner/DM drag:**
- Phase 2 `grabbed` immediately highlights already authorized selected sprite(s), before network permission checks return.
- `presented` uses ONLY the known-geometry Phase 3 predictor's accepted speculative presentation. No unknown walls are inferred from an arbitrary cursor location.
- `approved` ACKs update canonical approved visual bounds but cannot automatically drag the sprite *backwards* from a newer approved local prediction. `blocked` returns to the latest server-approved safe boundary.
- `released` retains the display transform. `committed` holds the accepted endpoint until the next fresh authorized roster includes the same canonical coordinates. There is no timer-based blind overlay expiry.
- `cancelled` or `rejected` clears local preview, restores the previous sprite and requests an authorized resync. `revoked` hides the roster and fog immediately.

**Remote observers:**
- Paths are private, server-approved ordered adjacent cells, with no extrapolation across missing bends or hidden geometry.
- A fresh roster matching any approved remaining waypoint—or the origin of an in-flight approved route—does not reset the interpolating sprite.
- Unrelated canonical coordinates trigger immediate authoritative rebase, not an invented straight-line interpolation through unknown walls.
- A missing recipient sprite ID cannot be created by a motion packet. A server `hide` removes its node immediately. A stale cursor cannot re-authorize a hidden piece. Reconnect/permission changes require a fresh atomic Phase 7 snapshot.

**Mixed-size pieces:** `setSpriteDimensions(kind,id,{spanX,spanY})` updates an *already-authorized* token/tool DOM node without remounting. The Phase 9 adapter must supply these sizes and any artwork/labels from existing RLS-authorized rows; they are not guessed from a private NPC or unauthorized stream.

## 6. Fog authorization and smooth visual edges

Phase 7 alone computes sight/LOS/light and returns a strict `visible/explored/visiblePieces` frame. The Phase 8 renderer only applies those grants:

- Cell 0: fully concealed, opaque map cover.
- Cell 1: explored history, dim cover.
- Cell 2: currently authorized visible, transparent cover.
- The fog canvas's CSS background is transparent on valid frames; concealed pixels are **painted opaque in the canvas**. When authorization is absent or revoked, the canvas becomes fully opaque synchronously.
- Soft edge gradients shade *inside* a visible cell towards its concealed neighbour. They **never** clear any pixels of the hidden cell, preventing a decorative blur from revealing secrets.
- Dirty mask updates include one-cell neighbours to repaint gradients correctly; unchanged masks don't redraw.

Player movement changes dynamic vision only via V2 private `world-vision-v2` notices and authorized snapshots; map terrain/static wall geometry is not reloaded.

## 7. Security and revocation details

The renderer requires a currently published, immutable, map-matching Phase 6 scene followed by an exact map/viewer-matching Phase 7 frame with the same environment revision and scene generation, and a server-owned `scope`.

A player frame cannot be applied to an old DM scene; mismatched or malformed scope hard-clears DM-only guide pixels, terrain source and all sprites. A new permission generation similarly requires fresh scene authorization. Ordinary valid motion cannot reveal a new entity or a cell outside current authorized fog. A missing/invalid observer sequence forces a fail-closed resync.

DM player preview is an explicit mode: the DM may retain their authorized geometry internally while `playerPreview:true` suppresses DM-only static guides and renders only the preview player's server-authorized sight. It is not a bypass for underlying permission or wall collision.

## 8. Phase 9 integration boundary (mandatory before live)

The only acceptable future runtime wiring is:

```text
Phase 6 SceneManager.onChange
  → WorldRenderer.adoptScene(publishedSnapshot, dirtyRegions)

Phase 7 VisibilityController.onSnapshot
  → WorldRenderer.adoptVisibility(authorizedSnapshot)

Phase 5 RealtimeTransport.onPath(item, meta)
  → WorldRenderer.applyObserverPath(item, meta)
Phase 5 RealtimeTransport.onHide(item, meta)
  → WorldRenderer.applyObserverHide(item, meta)
RealtimeTransport.onResync(reason)
  → VisibilityController.observerSnapshot()  [one cursor+roster+mask]
RealtimeTransport.onRevoke
  → WorldRenderer.revoke(...) [permission-sensitive]

Phase 2 MovementController.onEvent
  → WorldRenderer.applyLocalMovement(event)

RLS-authorized token/tool attributes/size/artwork
  → WorldRenderer.setSpriteDimensions(...)
DM map image source
  → WorldRenderer.setTerrainSource(...)
Input camera
  → WorldRenderer.setCamera(...)
```

On map switch, sign-out, campaign role change or private socket disconnect, revoke the previous renderer and server subscriptions before adopting new snapshots. A commit/rejection should request a fresh authorized canonical roster. Phase 9 must keep the original map editor, toolbar, sheets, measuring tools, DM tools, tools-as-units and visual affordances intact **without simultaneously mounting legacy token/fog/motion paint loops**. Phase 10 must retire those original loops and privileged SQL, including the staged temporary Phase 4 trigger compatibility GUC.

## 9. Verification and release gate

Automated testing exercises:
- Scheduler coalescing, idle RAF suppression, pause/resume frame time clamp and disposal.
- 500 distinct authorized tokens painted with a single frame callback and detached on disposal.
- Three mixed token/tool routes interpolated by one frame stream, including right-angle turns.
- Local mouse grab highlight before any server ACK, later approved predictions, rejection, blocked boundary, verified commit handoff and old canonical snapshots.
- Stable sprite node identity across 25 fog/cursor refreshes, no static/terrain remount, CSS camera transforms.
- Minimal fog repaint (one changed cell plus adjacent feather cells), fully hidden cells remain opaque, clear visible cells remain truly transparent, no visual feather leak.
- DM preview, permission change, hidden NPC rejection, unknown path rejection, old cursor replay, map switch and secret DM scene erasure.
- Large fogless maps avoid oversized fog canvases; token/tool footprints remain configurable.
- Full Phase 4–7 synthetic PostgreSQL permission/motion/fog contract fixture, frontend build, security tooling and React JSX compilation.

**Still required:** A browser-mounted integration test with real Supabase/Vercel, measured local pickup latency/observer jitter at 2/4/8 clients and 10/50/100 pieces, low-end-device frame/memory diagnostics, map editor/door updates and all non-movement regression checks. Neither synthetic Node tests nor CI prove the deployed experience. No release should occur before Phases 9–13.

**Release state:** Phase 8 isolated staging. Seven staged V2 migrations remain repository-only; production Supabase and live site unchanged.
