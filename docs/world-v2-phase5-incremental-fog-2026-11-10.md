# World Engine V2 — Phase 5 incremental fog optimisation (10 November 2026)

## Rendering authority remains unchanged
The published map/terrain and DM static scene remain cached on their existing DOM/canvas surfaces. Player fog is **never inferred from client walls**; a validated server-issued viewer sight snapshot is required for every currently visible/explored cell, roster change and prediction grant. Real map, permission, scene or authorization revocation still fail closed.

## Staged work
1. **Reuse unchanged mask:** A new cursor, token position or light update under the same map, viewer, scope, scene revision/generation and permission generation reuses the old fog mask if visible/explored arrays are identical; never share mask state across an authority boundary.
2. **Coalesce updates against actual painted pixels:** Compare each new authorized mask to the last *painted* mask. Multiple RPCs received before a requestAnimationFrame repaint only the net difference. The existing fog painter consumes the trusted computed dirty rectangles instead of scanning the mask again; invalid rectangle bounds force a full paint of the current verified mask.
3. **Avoid full-board invalidation:** On highly fragmented fog differences (>128 row runs), 8x8 dirty tiles replace one giant bounding box. Limit work to at most 256 tiles for a 128x128 fog-enabled board. Expand by one neighbor cell only for cosmetic feathering, never for authorization.
4. **Keep sprites stable:** Only reconcile the observer roster when visible piece identity/position changes or a hidden sprite needs authorized regrant. Fog-only frames recompute visibility for each sprite footprint but dirty only sprites whose server-certified visible/concealed state changes. Token node identity and in-flight approved route are retained.
5. **Fog-disabled free-tier path:** Large fogless maps remain a 1x1 transparent overlay and do not fire \`onFog\` for every movement/cursor update. No additional SQL calls, tables, Realtime channels or browser animation loops.

## Gates
The staged regression suite checks 100 vision revisions, unchanged terrain/scene/sprites, 100 idle cursor updates without a frame, current-fog sprite conceal/regrant, simultaneous sight RPC coalescing, highly fragmented 128x128 diffs, malformed dirty regions and 100 updates on a large fog-disabled map. Existing authorization/collision and Chromium drag tests must continue passing.

These are deterministic source-level tests. A 100-movement live authenticated multiplayer session with fog, walls, multiple tokens, light effects, network delay and reconnect is still required before declaring the full release gate complete.

No production deployment or Supabase migration has been performed.
