# Step 2 — Active-movement fog, collision and permission invalidation

Date: 2026-11-09
Consolidated staging branch: `stage/complete-predictive-navigation-and-fog-2026-11-09`
**Status: staged, not release-ready. No production SQL, Vercel release or migration.**

## Sources inspected

- Staged `AuthorizedNavigation.js`, `AuthorizedFogDelta.js`, `MapFogModel.js`, `useAuthorizedMapFog.js`, `TabletopApp.jsx` and `BattlemapBoard.jsx`.
- Installed read-only Supabase definitions and triggers for `publish_map_environment`, `forge_visibility.bump_tick_scoped`, `forge_visibility.bump_viewer_ticks`, `forge_visibility.tick_tokens`, `forge_visibility.tick_character_elevation`, `map_environments`, `map_rules` and the viewer visibility tick publication.
- Existing staged migrations `20261109000100`, `20261109000200` and `20261109000300` remain unapplied. Published scene revisions are already included in their intended fog/navigation protocol. The installed `publish_map_environment` increments the live scene revision and issues visibility ticks after publication. A prepared-but-unpublished map does not change live collision.

## Root causes corrected in Step 2

1. **Every visibility revision previously invalidated the entire graph.** Even ordinary authorized sight shifts from a moving character could eject the graph and interrupt local movement. The new `adoptFrame` keeps the existing *server-issued* graph within the same scene, authorization epoch and fog/collision mode; a moving visibility mask clips the graph's allowed *new transitions* to the currently confirmed cells. Grant expiry and server final collision checks remain mandatory.
2. **An old graph could permit movement into newly revoked cells.** `allows` now requires the entire current unit footprint at both endpoints to belong to the current authorized sight set, or to a server-confirmed fog-disabled map. Hidden cells remain impassable. Already-traversed legs from a previously authorized path do not need to remain visible behind a moving player; final route approval checks the issued graph and the *current endpoint*, while the server independently validates the entire trajectory.
3. **Pending/reconnecting fog was able to look like an empty-but-authorized frame.** Frames marked `displayVisibleDuringRefresh`, malformed frames and wrong-map frames now immediately revoke client navigation instead of minting a new grant for an unconfirmed mask.
4. **An active drag retained its imperatively-painted destination after hard authorization revocation.** The board now synchronizes authorized navigation in a layout effect and immediately cancels gestures whose scene/mode authorization changes, current endpoint is revoked, token/tool is no longer controlled, canonical origin changes or footprint changes. The temporary transform and server movement session are cleared; no final coordinate commit is submitted from a cancelled gesture. Valid sight shifts keep the sprite painted and do not cause a group-wide board reload.
5. **A visibility tick arriving during a grant RPC could starve initial movement.** An older, still-authentic grant response for the same scene is accepted as a safe subset only when the currently confirmed frame is newer; its movement edges remain clipped to current sight. Response scene revision, collision mode, piece, origin and footprint must match.
6. **Character/tool footprint changes were not part of grant cache identity.** The requested canonical origin now includes dimensions, and replies are validated against the footprint issued by the server. RLS removal/ownership loss evicts individual piece grants.

## Validation performed

- Ran the staged movement/navigation test file in an isolated JavaScript harness against current connector-fetched module source: **16/16 passed** (2026-11-09). This covers opaque graph checks, swept path constraints, multi-token movement, cache expiry/revision, private fog delta validation, in-flight race handling, footprints, restricted visibility, scene revocation and active drag cancellation wiring.
- This is **not** a complete React browser test, GitHub CI report, CodeQL result or authenticated Supabase RPC test. Those remain release gates; no production SQL was executed.

## Design boundary and remaining risks

- A local client cannot know about an unseen server-side revocation until a trusted update arrives. Current server persistence still validates walls and permissions; actual latency between publication and private Realtime delivery needs live measurement.
- The existing **12-second** navigation grant timeout remains. Source-level testing cannot establish p95 remote motion latency or Supabase resource cost.
- Attribute-threshold permission changes may affect passability without changing the map environment revision or visible-cell set. Final database movement remains authoritative; a separate *permission-generation* invalidation gate will be needed before declaring the entire redesign release-ready. Do not confuse this remaining security/correctness gate with a completed fix.
- Tool-only final writes and NPC/character-specific movement permissions require the subsequent full compatibility and backend security steps.
- Unknown, stale, missed or invalid private authorization causes fail-closed behavior; it is deliberate to conceal unauthorized sight even if it briefly interrupts movement.
- A full browser matrix must cover moving torch, door opened/closed during a drag, secret door, one-way geometry, 1×1/2×2/4×4 creatures, simultaneous groups, private maps, viewer demotion, dropped Realtime events and reconnect. Observe artwork reloads and SQL query counts.
- Do not stage additional infrastructure, run paid branches, deploy or apply any production migration before the designer's explicit release approval.

## Deployment dependency

Release all staged frontend and required November 9 SQL together, after full SQL grants/RLS/CI/security review. Do not deploy just this intermediate stage. Restore previous client-side mode if the authorized protocol cannot be made available at the same release boundary.
