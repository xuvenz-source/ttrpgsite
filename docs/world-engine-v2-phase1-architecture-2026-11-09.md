# World Engine V2 — Phase 1 Architecture and Interface Specification

**Project:** TTRPG Site / Tabletop Forge  
**Date:** 2026-11-09  
**Status:** Proposed, ready for designer review; not an implemented engine  
**Source baseline:** `main` at `ab0901f7cbe85f2bf62bccf7c0941c3eec928d04`  
**Working branch:** `stage/world-engine-v2-2026-11-09`  
**Allowed changes in Phase 1:** Architecture specification only. No production merge, release, SQL migration, privileged grant or deployment.  
**Prerequisite:** Complete Phase 0 inventory, migration/RLS verification and baseline measurements before beginning invasive implementation. This specification records observed seams but is not an exhaustive audit.

## 1. Decision summary

Build a completely new, isolated `src/engine/v2/` implementation. It must not import legacy movement, navigation, observer, fog or collision controllers. Preserve existing campaign/map/token/tool identifiers, persisted map geometry, per-viewer exploration, control permissions and unrelated features through explicit bounded integration adapters. Use one movement core for DM and player; authorization differs, movement lifecycle does not.

**The authority boundary is the server.** The client can present immediate grabbing and smooth motion in currently authorized space, but cannot infer or acquire passability or entity visibility in undisclosed space. A collision refusal stops at the last approved boundary and never produces an optimistic wall crossing. No per-frame and no one-tile-at-a-time canonical database writes.

The published environment is static until changed by the DM; current fog visibility is dynamic per viewer and changes with authorized movement/light. Exploration persists separately. Do not treat static map fog settings and dynamic current sight as one mutable payload.

## 2. Architecture dependency rule

`InputController` -> `MovementController` -> `WorldSimulation` -> `AuthorityClient` -> server validation.

`WorldStateStore` stores authoritative, approved transient and presented positions. `WorldRenderer` and attached decorations consume presentation state, never independently calculate movement. `VisibilityController` consumes **server-authorized** per-viewer fog/entity-visibility messages and current permission state; `LightingRenderer` presents those masks, never grants sight. `SceneManager` maintains published scene revision and audience-specific available geometry.

`RealtimeTransport` delivers server-validated, recipient-filtered observer movement and authorized visibility deltas. It cannot decide permissions or movement validity. The database is not the animation clock.

**Dependency constraints:**
- React app/UI may call engine public APIs; engine modules must not import `TabletopApp.jsx` or `BattlemapBoard.jsx`.
- Rendering must not call movement RPCs or mutate canonical positions.
- Input must not access Supabase directly.
- Client collision/prediction must not require undisclosed wall/secret NPC geometry.
- Visibility must not trust a local predicted position to reveal fog or entities.
- No alternate legacy movement/reconciliation/fog path after cutover.
- Each mounted map gets one V2 engine lifecycle; dispose listeners, RAF, channels and sessions on unmount/map change.

### Proposed module tree

```text
src/engine/v2/
  index.js                     # bounded facade for React
  contracts.js                 # validators/constants for V2 envelopes
  coordinates.js               # grid/pixel conversion, footprints
  InputController.js           # pointer/touch/keyboard normalization
  MovementController.js        # one explicit gesture state machine
  WorldSimulation.js           # deterministic path/position updates
  CollisionSolver.js           # known-geometry preflight only
  AuthorityClient.js           # session, path-batch, final commit, retry
  WorldStateStore.js           # canonical/accepted/presented position states
  RealtimeTransport.js         # recipient-scoped verified observer events
  WorldRenderer.js             # single RAF loop and stable sprite positions
  VisibilityController.js      # valid viewer snapshots/deltas + revocations
  LightingRenderer.js          # visual masks/effects, no authorization
  SceneManager.js              # published geometry and revision lifecycle
  EngineDiagnostics.js         # aggregated latency/paint/network counters
  adapters/
    TabletopAdapter.js         # UI props/events, no legacy controller import
    MapDataAdapter.js          # read existing map/token/tool structures
    SupabaseV2Adapter.js       # new V2 endpoints only
```

These are proposed responsibility names, not created files. Split/merge internally only if the one-owner invariant is retained.

## 3. State ownership matrix

| State | Authority/owner | Consumers | Persistence/invalidation |
|---|---|---|---|
| Map dimensions/grid | Existing map record, server | Scene, rendering, collision | Until map metadata revision |
| Published walls, doors, lights and fog settings | DM-published `public.map_environments` and corresponding server rules | Server geometry + DM editor; sanitized grants for players | Publish/environment revision change only |
| Geometry acceleration structure | Server scene compiler; client only for disclosed geometry | Collision/LOS | Geometry revision |
| Token/tool canonical grid location | Server-authorized position write | World store, presence, reconnect | Canonical committed state, row/position revision |
| Actor's pointer path | Input/gesture controller | Simulation | Ephemeral, never authoritative |
| Actor's locally presented position | WorldStateStore | WorldRenderer | Ephemeral; epoch/gesture invalidation |
| Authorized in-flight movement prefix | Server session and approved reply | Store/render; observer transport | Bounded, expiring; no blind trust |
| Remote observed trajectory | Server-filtered private observer message | Remote renderer | Sequence-scoped, recipient specific |
| Current visible cells and legal entity visibility | Per-viewer server authorization | Fog, entity renderer | On movement/light/permission changes |
| Explored history | Existing `forge_visibility.exploration` | Per-viewer fog | Persistent, server controlled |
| Moving lights/torch positions | Authorized piece movement + server lighting | Visibility and rendering | Transient motion + authorized changes |
| UI selection, status cards, measurements | React/UI controllers | UI | Unrelated to canonical world state |

Existing `map_environments` prepared/live/revision, map rules, exploration data and current campaign permissions are migration inputs to preserve, not structures to delete casually. Verify exact production SQL signatures and grants in Phase 0.

## 4. Coordinate and identity contract

- **Canonical grid**: integer cell coordinates {x,y}; map dimensions in pixels and `grid_size` give cell bounds; the existing persisted coordinate schema remains until an explicitly reviewed migration. Cell (0,0) is the top-left grid origin.
- **Presented coordinate**: finite fractional grid coordinates, used *only* to transform sprites and decorations and never written as canonical authority or used as a sight grant.
- **Pointer coordinate**: viewport/local pixels converted once into fractional grid coordinates. Pointer sampling must be independent of RPC completion.
- **Footprint**: positive dimensions in cells (existing `span_x`/`span_y` for tokens; mapped tool footprint); sweep entire footprint and all selected pieces along each authorized segment.
- **EntityKey**: {mapId, kind:'token'|'tool', id}. Group movement is a set of EntityKeys with an explicit anchor and verified rigid offsets.
- **Map generation**: changing map/campaign/auth context creates a fresh engine epoch; old events and responses are ignored even when piece IDs match.
- **Geometry/permission versions**: server issues generation/revisions; never use a client timestamp as an authorization version.
- **Rendering pixel formula**: (presented cell - canonical cell) * grid pixel size * applicable viewport scale, with pan/zoom applied once at the map transform layer. Avoid a second CSS transition for movement.

Scene positions and transient path samples share a grid coordinate convention, not independently rounded pixel positions. Keep conversion tests for zoom, fractional high-DPI pointers and larger footprints.

## 5. V2 public engine facade (proposed API)

```ts
interface EngineV2 {
  mountMap(context: ViewerMapContext): Promise<void>;
  updateContext(context: ViewerMapContext): void;
  beginGesture(selection: EntityKey[], pointer: GridPoint, mode: 'drag'|'keyboard'|'touch'|'preview'): void;
  updateGesture(pointer: GridPoint): void;
  endGesture(): Promise<void>;
  cancelGesture(reason: 'user'|'map-change'|'permission'|'disconnected'|'scene-change'): void;
  applyCanonicalSnapshot(snapshot: AuthorizedWorldSnapshot): void;
  applyPrivateMotion(packet: AuthorizedObserverMotion): void;
  applyVisibility(packet: AuthorizedVisibilityEnvelope): void;
  onPresentationChange(listener: (changes: ReadonlyArray<PiecePresentation>) => void): () => void;
  dispose(): void;
}
```

React integrates through `TabletopAdapter` and does not control per-frame sprite position through React state. The facade accepts only sanitized, authorized server data for observer/visibility operations.

## 6. Movement state machine

`Idle -> Grabbed -> AwaitingAuthority/Moving -> Finishing -> Committed -> Idle`, with exits to `Cancelled`, `Rejected` and `Revoked`. Visual pickup occurs immediately. Known-authorized steps may be presented immediately. Unknown/concealed edges remain at the approved boundary until validation; requests can batch ahead without a per-tile input bottleneck.

- `begin`: capture pointer, selection, local baselines and map epoch; ask authority for an actor-scoped session.
- `move`: sample pointer, compress meaningful bends, preserve ordering; compute only disclosed/local legal preflight; submit bounded segments independently of RAF.
- `ack`: validate version, session, seq, accepted contiguous prefix and current revision; extend the approved route. Never accept a shorter/older ACK over a newer accepted sequence.
- `finishing`: persist final intended path endpoint and the entire outstanding validated prefix; pointer-up must not silently drop queued bends.
- `commit`: server rechecks permissions, environment, full footprints and canonical result. Rebase presented sprite to authorized canonical snapshot without a visual reset.
- `revoke/cancel`: stop presenting future unauthorized movement immediately, cancel session, clear stale grants/recipient exposure, and reconcile from fresh authorized snapshots.
- `disconnect`: retain only the last permitted display state until scoped authorization resolves; never promote unconfirmed preview to canonical.

Keyboard, DM preview, token drag, tool drag and group drag share this controller. DM preview performs the same collision simulation with player-effective rights but never commits.

## 7. V2 authority and wire protocol (proposed; not existing RPC names)

The V2 backend should expose exactly one versioned movement family, such as `begin_world_motion_v2`, `advance_world_motion_v2`, `commit_world_motion_v2` and `cancel_world_motion_v2`. Final names are fixed in Phase 4 after a migration/RLS audit.

**Request:** version=2; server-issued sessionId; strictly increasing seq; map generation/environment revision last observed; ordered bounded path bends/samples; explicit end-of-gesture flag. The server obtains actor identity via `auth.uid()`, not client-supplied actor/ownership.

**Server reply:** version=2; sessionId; acknowledged seq; authoritative revision; accepted contiguous path prefix or neutral rejection; new approved endpoint; expiration/status. Never provide raw blockers, hidden wall IDs, secret NPC attributes or global player lists. Reject oversized/out-of-order/expired/mismatched session events. A blocked direction may be inferable from an attempted move; rate-limited probing remains a documented residual risk.

**Observer motion:** server-authorized recipient-scoped private event with version, map epoch, sequence, authorized piece key, accepted ordered path, end-state and monotonic revision. Unauthorized recipients receive no event, including no presence/identity metadata for concealed NPCs. Object creation additionally requires RLS-authorized roster visibility.

**Visibility envelope:** version, viewer-scoped epoch, mapId, environment/permission version, monotonic visibility revision/seq, mask dimensions, full snapshot or bounded sparse delta; never raw world geometry. New snapshot replaces visibility. Deltas apply only to the same prior epoch/sequence. On gap, hide new entities immediately and request an authoritative resync. Exploration is cumulative only when the server grants it.

**Important invariants:**
1. No client-authored Realtime position broadcast is a trusted source.
2. The server checks permission and swept collision again at final commit and against direct table writes.
3. Events are not reordered based on wall-clock timestamps.
4. The client cannot turn motion acknowledgement into new vision without a server visibility envelope.
5. Canonical and transient positions share a deterministic transaction/revision relationship; a fresh canonical snapshot cannot be overwritten by an older preview.
6. Group moves are atomic per approved step; no member passes an obstacle while another rubber-bands.

## 8. Collision and hidden-world policy

Build deterministic collision geometry primitives and shared fixture tests for server and client-known geometry. The server always uses complete authoritative geometry. The player client can use only public/disclosed geometry or server-issued bounded permitted-edge grants. A grant is time-, map-, piece-, environment- and permission-scoped, never an infinite cached wall map.

Test swept area, diagonal contact, one-way/conditional walls, blocked doors/windows, elevation/attributes, large footprints, sliding, fast motion and exact last-valid boundary. Dynamic door/environment changes invalidate applicable grants and in-flight segments. DM bypass must be explicit, permission-checked and audited; DM preview never gets a bypass merely from account role.

## 9. Scene, fog, lighting and visibility

- **Published scene**: keep `public.map_environments` prepared/live revision model; publish or actual object/rule change invalidates static collision/LOS/light geometry. Ordinary token motion cannot increment static revision or remount the image.
- **Dynamic sight**: derived from authoritative/approved motion positions, per-viewer rights, walls, doors, lights, shared-vision rules and server policy. Only server-computed, recipient-specific cells/entities are sent to players.
- **Explored history**: preserve existing `forge_visibility.exploration` semantics and party sharing; exploration and current visibility are different data planes. The published fog configuration is saved with the map; sight still changes as tokens move.
- **Stable fog renderer**: a persistent canvas/mask with dirty-cell updates. Fog is opaque on missing/invalid authorization; presentation continuity must not keep secret current sight after revocation.
- **Lighting**: static occlusion cache may survive ordinary movement; moving torches and temporary lights update dynamic visibility only for affected viewers/regions. Visual weather/flicker never changes authorized sight unless a deliberate, server-published lighting rule does.
- **Entity visibility**: independent permission/RLS check plus fresh viewer sight. A fog overlay alone is not sufficient to hide unauthorized token data.

## 10. Rendering and transport scheduling

- Exactly one animation-frame scheduler per mounted engine, not one per piece, fog request or observer timer.
- Stable sprite DOM identity and one render position for all artwork, monitors, status markers, held lights and selection decorations.
- Motion input at frame rate; network requests are bounded, coalesced by gesture and serially ordered where required. No write on every tile/frame.
- Remote observers interpolate on a verified ordered path, preserving turns instead of jumping directly across corners.
- Buffered snapshots remain keyed by map/piece/session/revision; late canonical state must not flash, replace the map image or remount all tokens.
- Use one authorized channel family per map/viewer scope, not per-token subscriptions. Explicit unsubscribe/dispose.
- Keep browser resource budgets and Supabase free-tier request/WAL/memory diagnostics as release gates; avoid introducing Redis, paid servers or additional mandatory services.

## 11. Authority and trust table

| Input | Trust | Allowed use |
|---|---|---|
| Pointer / keyboard input | Untrusted | Intent and local feedback only |
| Client disclosed collision preflight | Advisory | Restrict presentation, never grant unseen travel |
| Server movement ACK | Trusted only after envelope/session/revision validation | Approved path presentation |
| Authorized RLS world snapshot | Trusted after scope/revision check | Canonical piece state |
| Private, recipient-filtered motion event | Trusted after scope/sequence check | Remote presentation only |
| Authorized per-viewer fog envelope | Trusted after epoch/sequence check | Fog and sight presentation |
| Player-supplied Realtime payload | Untrusted | Never canonical authority or sight |
| DM editor's local draft geometry | Editor-only | Never active collision until published |

Server SECURITY DEFINER functions must pin search_path, validate auth/map/piece ownership on every mutation, protect session tables, grant EXECUTE deliberately, and refuse access through direct REST table writes.

## 12. Legacy migration and zero-remnant strategy

Current import evidence from `src/BattlemapBoard.jsx` and `src/TabletopApp.jsx` shows multiple existing concerns at once: `MapCollision.js`, `MapMovementTrajectory.js`, `DragCollisionGuard.js`, `ConcealedMovementGate.js`, `ConcealedGestureBatch.js`, `TokenMotionRuntime.js`, `AuthorizedNavigation.js`, `AuthorizedMotionTransport.js`, `ObserverMovement.js`, `ObserverPreviewQueue.js`, `BufferedObserverPathQueue.js`, `RemotePositionSettler.js`, `LiveTokenMovement.js`, `useAuthorizedMapFog.js` and `MapFogOverlay.jsx`. Their presence is **not proof of duplicate runtime execution**; Phase 0 must trace call sites and determine actual ownership. This is an initial replacement-candidate list, not a deletion instruction.

Plan a separate old->V2 ownership ledger for every import, event handler, subscription, timer, database RPC, trigger, grant and fallback. First build V2 isolated. Then integrate all consumers via the public facade. Finally remove retired source, subscriptions, flags and endpoints through forward migrations. Historical committed migration files remain intact. Old SQL functions may be retained only during an explicitly bounded compatibility/cutover window, and must be revoked/dropped after final acceptance. Rollback is a separately reviewed old frontend plus compatible database plan, not a permanently active legacy fallback.

Do not cherry-pick older, divergent staging fixes into V2 without checking their actual presence on `main`. Previously staged non-movement functionality must be reconciled at the single integrated release gate.

## 13. Contract verification for Phase 1

Before Phase 2 implementation, review and approve:
- [ ] One unified input/gesture lifecycle for players/DM and all piece kinds.
- [ ] Exact coordinate, footprint and grid-to-pixel conventions.
- [ ] Map epoch, geometry revision, permission generation and motion sequence semantics.
- [ ] Distinct pointer/presented/approved/canonical positions.
- [ ] API versioning, payload bounds, retry/idempotency rules and secure failure handling.
- [ ] Group movement atomicity, explicit DM override and DM preview rules.
- [ ] Static map settings vs dynamic sight vs persisted exploration.
- [ ] No local prediction of hidden blockers, NPC identities or unauthorized light.
- [ ] One renderer/transport lifecycle and strict resource cleanup.
- [ ] Exact old->new call-graph, including SQL grants and RLS, remains Phase 0 dependency.
- [ ] No source/production/migration deploy changes have occurred in Phase 1.

**Exit status:** The architecture is drafted and staged for review. It is *not* implemented or performance-tested. The Phase 1 completion gate requires designer approval and the Phase 0 dependencies must be verified before Phase 2 code begins.
