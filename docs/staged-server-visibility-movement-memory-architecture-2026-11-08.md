# Server-side movement preview and visibility architecture — 8 November 2026

**State: staging only, no live migration and no Vercel deployment.** Built on draft PR #52, retaining all earlier staged player-side fixes from production #51 and PR #52. No paid Supabase branching, new services or preview deployments.

## Existing bottleneck and correctness boundary

Read-only database inspection found `public.preview_map_motion` delegates to `forge_visibility.dispatch_movement_preview`. A valid preview makes a private `movement_preview_rates` upsert and then loops through up to 32 permitted campaign recipients. For each recipient it calls `forge_visibility.observer_can_see` at the start, at the destination, and sometimes at **every intermediate path sample** (up to 12 sample divisions). Each call previously reloaded map metadata, recipient/DM assignment, scene, and up to eight permitted sight-source token rows. Those repeated queries compound under a multi-browser drag test. The measured ~393 ms preview mean is a cumulative statement average, not a p95 or a forecast of speedup.

### Staged optimization: shared per-recipient viewer snapshot

`staging/sql-candidates/observer_path_visibility_single_snapshot.sql` is a **review-only SQL candidate**; the live database has **not** been changed.

- New PRIVATE `forge_visibility.observer_path_status` runs the same DM/player-map authorization, fog-mode checks, permitted sight-source filters, ray blocking and light tests, but uses `WITH sources AS MATERIALIZED` to load the sight sources once per recipient for all samples.
- A numeric status denotes (0) origin not visible, (1) origin and complete route visible, or (2) origin visible but route not fully visible. No hidden coordinates or viewer data are returned to public clients.
- The existing trusted `dispatch_movement_preview` retains actor from `auth.uid()`, token/tool ownership checks, explicit DM collision bypass, swept geometry, bounds, 100 ms database rate limit, monotonic sequence, max 32 recipients, and private `realtime.send` per user. It uses the helper once per recipient rather than repeatedly calling `observer_can_see`.
- Origin invisible means **no** event. A visible origin with a concealed route produces only a `hide` event **without** x/y. Only an entirely visible path produces a `move` event with coordinates. A route longer than 12 cells still hides rather than exposing a private shortcut.
- Client `preview_map_motion` signature/grants, `commit_map_trajectory`, collision RLS, `map_visibility_ticks`, fog snapshot RPC and persistent data schema are unchanged.
- `staging/sql-candidates/rollback_observer_path_visibility_single_snapshot.sql` restores the exact previously deployed dispatcher and drops the private helper.

### Additional client change: tool resource scope

A fog frame must requery `map_tokens` and the RLS-protected **placed tool** rows: the `campaign_tool_map_tokens` SELECT policy depends on `can_observe_map_position`. By contrast `campaign_tool_issues` SELECT depends on campaign membership/recipient rather than map LOS, and templates are DM-only. Fog-only revision and changed-LOS effects now call `campaignTools.refresh(['placed'], true)` rather than refreshing all three resource families. Changes to issued tools, templates, placements and reconnects retain their own targeted realtime refreshes.

## Remaining server-authoritative visibility protocol work — DESIGN, NOT IMPLEMENTED

The current `forge_visibility.tick_tokens` still increments a map-wide sight revision on every coordinate update while fog is enforced, even when no player's authorized visibility changes. While that global revision is pending, player clients legitimately fail closed and hide unowned sprites. The following is necessary to eliminate this last flash without leaking concealed NPCs:

1. Define **separate server-owned authorization epoch and sight-frame revision** per viewer/map. Every RLS-sensitive token or tool change must either cause a new viewer revision or carry a server-derived proof that the viewer's authorized projection has not changed. Do not make this decision from a browser-supplied coordinate or previously rendered mask.
2. On published geometry, light, doors, map routing, partyShared, token ownership, vision attributes, source tokens or visibility changes, **invalidate conservatively** until a recomputed authorized frame is confirmed. This includes lighting attached to carried tokens, hidden NPC movement and group trajectories. Any incomplete metadata must force a full authorization refresh.
3. For position-only moves, derive per-viewer visibility changes using the server's full LOS/lighting/ownership rules and RLS. Only a proved unchanged authorized projection may avoid revocation. Ensure changes in observed token/tool *membership* trigger new RLS-filtered token/tool reads. A player must never keep a newly hidden NPC or receive a new NPC before visibility is authorized.
4. Deliver strictly monotonically versioned, recipient-private messages, no hidden coordinates or DM objects; reject stale/reordered reconnect messages and map/account switches. Keep a feature/version handshake, so clients without the new protocol follow the current fail-closed full-refresh path.
5. Avoid N × map-cell × movement preview writes. Budget per-recipient computation with bounded player count and event bursts, validate aggregate CPU/memory and request counts in real campaigns. Any optimization claiming visibility equality must compare **server-authorized** output and include mid-drag previews and held light emitters.
6. Preserve the existing one-write `commit_map_trajectory`, route wall collision, DM-only override, group atomicity and RLS. A protocol rewrite must not regress movement speed.

This design does **not** claim to have fixed legitimate sight-change flashing. It needs a future independently reviewed, compiled SQL migration and matching frontend behavior.

## Database memory work — still evidence gated

User screenshot shows committed memory ~1.54 GB after stress (~170 MB above earlier 1.37 GB), but this isn't measured physical RSS or swap. Sampling found 39 database processes/connections, 29 idle, with configured max 60. Overload appeared in monitor, badge, fog, trajectory and preview cumulative query metrics. No paid compute or `max_connections` change is justified on this evidence alone.

Capture actual used RAM/cache/swap, PostgREST pool occupancy/high-water mark, transaction failures and 2/4/6–10 client request latencies across matched stress windows. Only then consider a **reversible small reduction to the managed PostgREST pool** if peak active usage leaves headroom; verify login, map open, movement, realtime, sheet updates and inventory leases before keeping it. Do not blindly create all 33 FK advisor indexes. See <https://supabase.com/docs/guides/database/connection-management>.

## Required staging and live validation

- Static Node tests: `tests/server-observer-path-optimization.test.mjs`, `tests/authorized-token-derived-refresh.test.mjs`, `tests/multiplayer-performance-integration.test.mjs` and all existing fog/collision/inventory tests. CI test, lint, build, Deno checks and CodeQL against **one final PR SHA**.
- No new schema or permissions until designer approves production. **SQL candidate isn't compiled on a separate development database**, because no paid staging database is allowed. Convert candidate to a versioned migration with approved release, first verify function compile, exact grants, and fallback/rollback on the existing test database transaction where feasible.
- Live test DM and players (2/4/6–10 users, 10/50/100 tokens), fog-on/off, one-way walls, doors, token elevation, mounts/held torches, restricted NPCs, mixed group drag, race/reconnect and switching active maps. Compare old and new visible path decisions and hidden event payload shape. Monitor RLS/auth failures.
- Target: fewer expensive per-waypoint observer queries and fewer unrelated tool RPCs while retaining or improving p95 movement and minimizing memory pressure. **No numerical speedup or memory saving has been verified**. Document actual before/after metrics after an approved production release.
- Rollback server helper by the exact restoration SQL candidate; rollback client behavior by reverting targeted fog/tool refresh commits, without touching movement/collision schema.

**Release policy:** include every earlier staged component in one consolidated approved update; no silent omissions, automatic deploys, unapproved live migration, branch compute cost or preview deployments.


## Superseding implementation update — v2 per-viewer protocol now STAGED (not live)

The earlier section titled "Remaining server-authoritative visibility protocol work — DESIGN, NOT IMPLEMENTED" described the pre-v2 state. PR #52 now additionally includes:
- An **unapplied** SQL candidate, \`staging/sql-candidates/per_viewer_visibility_v2.sql\`, with private own-user revisions, authorization-aware scoped movement invalidation, and a new \`get_authorized_map_fog_v2\` wrapper around the original full LOS RPC.
- A client protocol negotiation/legacy fallback on \`useAuthorizedMapFog\`, RLS/permission regression tests, a rollback and a read-only post-migration verification script.
- The old global map tick and older clients still work. Published environment/rules, light, character elevation and other non-motion changes force conservative invalidation.

**Still NOT implemented:** a pixel-exact same-visibility proof for nearby/own-token movement, full browser-multiplayer and physical RAM/swap acceptance, and a reviewed server migration applied to live Supabase. Nearby moving sources can still trigger a temporary fail-closed mask. See \`docs/staged-per-viewer-server-visibility-v2-2026-11-08.md\` for precise rollout/rollback gates and limitations.
