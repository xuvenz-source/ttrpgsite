# DM tools refinements, map resume and server-enforced player vision

**Branch:** `stage/dm-tools-refinement-fog-collision-2026-11-07`
**Status:** draft staging only. Do not merge, deploy, apply SQL or toggle enforcement in production without the release gates below.
**Cost:** GitHub CI, existing Vercel and Supabase Free only. No paid branch, hourly compute or automatic preview deployments.

## Implemented in this staging branch

1. **Background browser tab resume:** preserve the current mounted map, token imagery, scroll and zoom. A Supabase `SIGNED_IN` event for the same user no longer invalidates all signed artwork URLs. On return after a background pause, reconcile map/tokens/monitors without clearing the current rendered board. Browsers may still throttle hidden tabs; we do **not** promise continuous animation, timers, or WebSocket delivery while hidden.
2. **DM Light Layer translation:** in **Select / edit** mode, pointer-drag a wall, door, window or light to move it freely. Portal red endpoints remain separately draggable for resizing. Keep fractional-cell geometry and shape without stretching at map bounds; show an immediate preview and save at release. Layer lock and DM-only restrictions continue to apply.
3. **Native dark UI:** change light/object quick-adjust and markers from light/pink styling to the app's existing slate/navy and subtle accent controls. Keep semantic labels and accessible buttons.
4. **Turn Order portraits and removal:** use the existing shared signed-artwork cache to render an authorized map token portrait. Hidden NPCs do not reveal images to players. The existing server-authenticated `command_map_combat('remove')` is wired into each row as a DM-only remove control; characters remain on the map.
5. **Reduced instructions:** remove redundant full paragraphs from the Map setting panel and object pop-outs. Retain action names, important state, errors, accessibility labels and reference documentation.

## Item 6 — player fog and collision: required server work (not yet implemented)

The current player-perspective tool is a **DM simulation**. `map_environments` is DM-only under RLS, and `map_tokens` currently allows players to read every `visible=true` token on their assigned map. Merely overlaying client-side black fog or sending hidden environment JSON to players would leak walls, tokens or unexplored areas and is **not acceptable as authoritative fog**.

### Implementation contract

- **Separate prepared vs live map state.** DM edits `prepared`; an explicit DM Publish/Reset updates the `live` environment and invalidates visibility caches. Player queries never read prepared geometry, secret walls or DM-only lights. Apply map-specific access controls and default-deny when the state is missing/invalid.
- **Authoritative sight and exploration.** Server computes per-player currently visible cells or clipped polygons from authorized controlled tokens, wall/door/window state, one-way direction, elevation and light. Persist explored tiles per map, per player or party according to the `partyShared` setting; reset only by explicit DM action. Limit range and geometry complexity. Show unexplored cells fully obscured, previously explored cells darkened, visible cells normally. Different players must not see each other's private exploration if sharing is disabled.
- **Sanitized delivery.** Publish only player-appropriate light/fog masks and observed token identifiers through RLS-protected views or RPCs. Replace broad player reads of `map_tokens` with visibility-filtered server results; audit Realtime publications, active turn tracker, token artwork and monitoring endpoints to avoid revealing hidden NPC details. Never send raw `map_environments.prepared` or the DM visibility polygon to player clients.
- **Collision enforcement.** Before accepting non-DM movement, the database must check the full swept token footprint against walls, doors/windows, blocking state, map bounds, and token-specific elevation rules. Validate direct PostgREST updates as well as drag, keyboard, group movement, multi-token interactions and RPCs; relying on a React-side test is bypassable. DM can reposition tokens intentionally without being blocked. Failed moves roll back optimistic UI and reconcile to the server position.
- **Realtime safety.** On token/door/light/map transitions, re-evaluate sight server-side and send only sanitized changes to authorized map viewers. Avoid leaks through payload contents, sequence timing and unauthorized map subscriptions. Do not let background tabs miss definitive state; reconnect requests authoritative snapshots rather than relying on every event.
- **Cost and performance.** No paid branching or background workers. Cap polygons, tokens and visible cells per map. Recompute incrementally on relevant events, and benchmark the existing Supabase Free tier with two players + DM before enabling.

### Required QA before item 6 may be called implemented

1. DM + two players: doors open/close; light on/off; fog on/off; explored memory on reload and map switch; independent and shared exploration; one-way walls; elevation pass conditions.
2. A player cannot retrieve unrevealed NPC names/images or wall geometry through Data API, Realtime, storage URLs, monitor RPCs or combat data. Check arbitrary direct SQL-backed API requests with role-switched test users.
3. Try movement through a wall by keyboard, single and group drag, direct REST UPDATE and client devtools; server rejects all. Test diagonal/corner, rotated barrier, larger tokens, door thresholds and map edges.
4. Confirm DM override, legitimate multi-cell movement, and reconnect after a background-tab suspension. Check CPU/query cost and browser FPS on large maps.
5. Tests on disposable staging data, official migration, verified transaction rollback, and explicit approval **before** any schema/RLS replacement goes live.

### Dependency

Security draft PR #20 addressing unrevealed NPC artwork must be reconciled with the visibility model; do not separately loosen Storage policies. Changes to the existing player-readable `map_tokens` RLS are high risk and need the completed backend and UI together.

## Review checklist for items 1–5

- Switch between browser tabs for 1s, 30s and after an expired signed URL. Previously decoded map/token art should remain visible and auth identity changes should clear signed bearer URLs.
- Drag lights, freehand/connected walls, doors and windows at various zooms; ensure exact placement and no edge distortion. Drag endpoints separately, check pointer cancel and locked layer.
- Light panel, switch, numerical inputs, colors, state indicators, keyboard focus and narrow viewport should use the native dark palette; confirm no Roll20-specific layout/copy.
- DM remove combatant from Turn Order, including current combatant; all clients update. Players cannot remove or see hidden NPC portrait; removing does not delete token or encounter.
- Run `npm test`, `npm run build`, and verify GitHub CI/CodeQL; conduct manual multiplayer browser smoke tests before release.

This branch deliberately leaves item 6 out of the live app until true server-side authorization exists. The editable fog checkboxes in Map setting remain **configuration only**, not proof of gameplay enforcement.
