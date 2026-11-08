# Step 3 — Navigation confidentiality and permission generation

Date: 2026-11-09
Release state: **STAGED ONLY. Do not apply SQL or deploy to Vercel without explicit designer approval.**
Branch: `stage/complete-predictive-navigation-and-fog-2026-11-09`

## Threat model

A signed-in player may directly invoke any public PostgREST function they have EXECUTE access to, supply arbitrary map and piece UUIDs, inspect JSON graph edge masks, issue requests concurrently, edit their own character attributes, use shared tools, or open multiple browser tabs.

Private map environments (raw wall polygons, secret door object types, hidden NPC values, unseen map tiles, campaign permissions) must never be disclosed by the navigation RPC. Navigation permission is ephemeral client-side *presentation permission*, not authorization to persist final moves. The existing `commit_map_trajectory`/collision/RLS validation remains the final authority.

## Verified pre-existing exposure paths

1. The staged 25×25-cell grant generator returned allowed-direction masks for every viewer-visible cell in the bounded origin window. Party-shared sight could contribute disconnected islands inaccessible from the requested token/tool, allowing remote collision probing.
2. Cached edge masks depended on visibility/scene revision, not on character-attribute, owned-NPC, or issued-tool state changes that modify `movementAt` passability.
3. A one-cell edge leading beyond the graph's origin-centred window could be returned, allowing boundary sampling outside the returned node set.
4. Diagonal movement across two authorized endpoints could cross orthogonally dark/unseen corner cells.
5. Multiple independent browser sessions could submit concurrent duplicate requests for the same controlled piece and increase expensive wall processing.

## Staged security changes

- The server constructs candidate permitted edges only for presently authorized footprints, then performs a directed breadth-first search from the **actual canonical database origin**. The RPC emits only origin-connected nodes and no raw wall segments, hidden door identities, attributes or field names.
- Edge construction clips BOTH endpoints to the 12-cell origin window and requires both orthogonal footprints to be viewer-authorized for diagonal movement through fog. Missing or malformed map sight fails closed.
- A per-piece transaction-scoped advisory lock prevents simultaneous duplicate expensive grant generation by the same authenticated actor. This is **not** a comprehensive sequential rate limit.
- New, private, RLS-enabled `forge_visibility.navigation_permission_generations` table holds a **map-scoped monotonically increasing integer**, not a hash of secret attribute values. Privileges are revoked from PUBLIC, anon and authenticated.
- Character-field updates invalidate all affected player-controllable navigation on maps with enforced collision (without selecting only hidden barrier-related fields, which would expose a presence oracle). Fog-only maps preserve selective previous visibility refresh logic for attribute-dependent sight.
- Updates to player-controllable token ownership, NPC values, linked character, footprint, visibility and map placement advance generation BEFORE the existing map-token visibility tick. Player-controllable tool config/state/ownership/party sharing/map changes also advance generation; no need to broadcast DM-only private NPC modifications.
- The new `permissionGeneration` is included in navigation RPC grants, private fog snapshots, fog deltas and verified client frames. A generation change immediately invalidates the navigation graph; in-flight grants with the old generation are rejected even if all visible cells and published wall objects are unchanged. The graph response uses a strict allowlist of keys.
- No client-authorable origin parameter is accepted. No private map geometry is sent in replies. The backend still validates every committed trajectory independently.
- Existing migrations `20261109000100`, `20261109000200`, `20261109000300` were edited together because **none have been installed** in production. Their order is part of a single release gate.

## Focused verification

- **21/21** tests in `tests/authorized-predictive-navigation-and-fog-2026-11-09.test.mjs` passed in an isolated JavaScript harness against the connector-fetched staged modules (source/contract checks included).
- Scenarios include: forbidden extra response fields, no arbitrary remote origin, stale permission-generation response, viewer fog delta changing only the generation, candidate connectivity checks, dark diagonal corners, grant radius restriction, token footprint, map/scene changes, RPC concurrency lock structure.
- Only read-only metadata and current security advisors were queried from the production Supabase project. No SQL migration, trigger installation, production token write or live RPC with the new schema was executed.
- GitHub CI, CodeQL, SQL compilation, RLS impersonation, browser Realtime delivery, concurrent multi-user tests and measured p95 CPU/latency are still **unverified**.

## Residual security/performance limitations — do not mark overall redesign release-ready

1. **Unavoidable local passability tradeoff:** even the reachability-only graph reveals some permitted/blocked edges within a player's already-authorized visible neighborhood, particularly around transparent or invisible barriers. If the DM requires an invisible wall's existence to remain secret until a player *attempts* crossing, future on-demand validation for that class of uncertain edge is needed. Do not claim zero-knowledge collision or perfect hidden-wall secrecy from opaque directional bits alone.
2. **Generation activity side channel:** a map-global monotonic revision can reveal that *some* player-controllable attribute/permission change occurred, though not which field, entity or wall. If even activity metadata must be private, partition generations by viewer and piece.
3. **Database cost:** on a collision-enabled map, every update to a player-controlled character's `field_values` emits an opaque generation and recomputes authorized viewer ticks. Stress-test rapid sheet edits before release; this trades extra CPU for immediate revocation without exposing secret attribute names.
4. **Rate limits:** advisory lock rejects concurrent same-piece RPC calls but does not restrict sequential abuse across many pieces. Supabase and application-level quotas remain a separate hardening opportunity.
5. **Server delivery delay:** current authoritative write guards reject illegal final movements, but the browser cannot react to an undelivered Realtime revocation immediately; measure publication-to-client latency.
6. **Release engineering:** SQL functions and triggers are staged text only. The installed database still has none of the November 9 modifications; syntax, dependencies and grants must be tested at the full release gate. No preview deployment should consume Vercel quota without authorization.

## Required release tests (after explicit approval)

Use only existing test campaigns. Validate no unauthorized graph for foreign maps, foreign/hidden tokens, unrelated tools, invisible walls, closed/secret doors and deliberately disconnected party-visible rooms. Try multiple player tabs and parallel RPCs. Change owned character attributes, an owned NPC attribute, shared tool state, token ownership and footprints while actively dragging. Verify permission generation, private fog frame, RLS projections and final-trajectory rejection. Benchmark token drag p95, navigation RPC request counts, fog tick costs, and Supabase memory commitment. Never add hourly-billed services.
