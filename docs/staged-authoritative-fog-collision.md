# Authoritative fog and collision — staging integration

**Branch:** stage/authoritative-fog-collision-foundation-2026-11-07
**Status:** Complete frontend/database release candidate under CI checks. **Not deployed; SQL not applied.**
**Cost:** Existing GitHub, Supabase Free, Vercel Free; no paid branch or worker.

## Recovered work
Original design and constraints were preserved from
stage/dm-tools-refinement-fog-collision-2026-11-07. The older branch did not
include player fog/collision enforcement and must not be merged wholesale.

## Staged connected implementation
- DM prepares lights, walls, doors/windows, ambient and fog as before.
  A new **Enforce wall and door collision** checkbox controls physical blocking.
  **Publish map rules** copies prepared to live in one authorized server
  transaction and opts in fog/collision per map. **Disable published rules**
  safely turns both off; **Reset exploration** clears that map's memory on
  explicit DM confirmation.
- Supabase candidate staging/sql-candidates/fog_collision_authoritative_release.sql:
  private map-rule flags and per-player explored cells, DM publish/reset RPC,
  server LOS/light calculations, bounded 128×128 fog masks, token row-level
  visibility, observed tool projections, map revision invalidation, and
  server-side swept-footprint collision triggers on tokens and issued tools.
- RLS now filters direct map_tokens SELECT and token INSERT positions for player
  calls; hidden NPC names and IDs are not delivered to an unauthorized player.
  Players cannot create pieces on opted-in physical maps: the DM places them,
  then players move existing pieces under server collision enforcement.
- get_authorized_map_combat returns only individually observable combat entries.
  Player map_combats direct SELECT is closed, while initiative submission RPCs
  continue to authorize owned tokens. Token monitors and encumbrance RPCs are
  restricted to observed tokens. Storage artwork signing is restricted to DMs,
  uploader-owned art, owned character art and observed map token art.
- On move/publish/door/light/tool/combat changes, map_visibility_ticks emits
  ONLY map/revision; player clients request fresh authorized fog and tokens.
  The shared token-preview coordinates are suppressed unless an authenticated
  snapshot explicitly confirms fog is disabled, avoiding hidden NPC coordinates
  in public map broadcasts. Browser focus/resubscribe re-fetches snapshots.
- Player canvas renders unexplored opaque, explored dim, current visible clear;
  when the fog endpoint fails the map stays covered, not accidentally revealed.

## Safety and scope constraints
- The candidate SQL is UNAPPLIED. A green JS test/build cannot prove a
  PostgreSQL migration compiles, role-specific RLS, or active multiplayer UX.
  The existing free production Supabase is the agreed live-test environment,
  but needs a separate explicit designer release instruction.
- Critical: the full **background map image** is still served to legitimate
  map viewers by the existing battlemap-assets policy. Like most browser VTT
  masks, fog protects the *rendered view and NPC data*, not a determined player
  inspecting a previously downloaded full map image. True terrain-image secrecy
  requires a separately designed server-side tile delivery/protection system.
- Server LOS currently supports 60 ft from player-controlled tokens, blocking
  vision through walls/doors/window curtains and one-way/elevation exceptions.
  Ambient brightness and environmental/issued light sources affect sight.
  Allowed maximum is 128 cells per axis, 120 environment objects and 2500
  points per published map. DM sees all, player partyShared configuration
  chooses combined light of sight and exploration; the first eight eligible
  source tokens per map are considered to bound free-tier load.
- DM placement is required once fog/collision is active. Group dragging
  currently writes members individually (a collision failure can move some
  members but not others); each individual crossing is rejected, never bypassed.
- Previously issued signed image URLs may remain usable until expiration;
  staging the new policy does not revoke URLs already handed out.
- The fog frame uses an opt-in published state. No migration automatically
  activates an existing campaign or changes its maps without DM publishing.

## Coordinated deployment when the designer approves
1. Verify branch/release diff and GitHub checks (npm tests/build/security).
2. Apply the staged SQL candidate **once** to the existing free Supabase
   project, observing errors and recording a migration. Ensure functions,
   triggers, RLS, Storage and Realtime publication are in the same transaction.
3. Deploy the matching approved frontend by merging a scoped release branch
   into main **once**. Do not leave an old client active alongside new RLS.
4. DM visits an existing test campaign and publishes one low-risk map with
   walls and light, confirms status and player map access.
5. Two players + DM: observe outside/inside walls; turn light/doors on/off
   then republish; private/party-shared explored memory; reload/map switch/
   background reconnect; larger tokens, doors, one-way/elevation, group movement.
6. Verify hostile read/write paths from real player sessions: direct Data API
   select map_tokens and combat tables, direct REST movement/creation,
   hidden NPC image signing, token monitor/encumbrance RPCs, Realtime
   token-preview/broadcast/network frames. Hidden NPC data must not leak.
7. Evaluate response times on the free tier; reduce geometry/source limits
   if needed. If activation fails, disable that map's published rules and
   investigate, rather than automatically dropping migrations/data.

No paid test database, hourly services or automatic Vercel preview deployments.
