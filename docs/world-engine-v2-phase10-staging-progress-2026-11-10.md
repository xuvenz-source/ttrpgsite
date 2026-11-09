# World Engine V2 — Phase 10 engineering completion and release boundary

**State:** engineering integration staged in Draft PR #58. The two-setting
V2 cutover remains **off**. No V2 SQL migration, Vercel deployment, preview,
production promotion or live Supabase write has been performed.
Do **not** describe synthetic tests as successful live multiplayer acceptance.

## Phase 9 finalization retained

- One alternative V2 board, one scene manager, one viewer-specific sight
  owner, one private observer transport, one RAF/render scheduler and one
  keyed token artwork tree. Legacy movement/fog engines are not mounted
  by the V2 board.
- Fixed pointer capture on actual board DOM element, not a coordinate object.
- Token/tool drag starts and tool handoffs consult the fresh authorized
  V2 roster, never stale React coordinate metadata.
- The DM's editor overlays cannot appear in player-effective preview mode.
- Custom global keybindings route into V2 input instead of legacy map writers.
- App-level board selection dynamically imports exactly one board. The
  inactive legacy board is no longer eagerly included in the V2 bundle.

## Phase 10 integrated implementation

### 1. Isolated DM preview

- DM-only virtual gesture authority checks an authorized DM collision scene.
- Player-effective virtual sight is recomputed through
  `preview_world_visibility_at_v2`, using only a selected, real player-owned
  visible token and bounded coordinates.
- No player token row, exploration history, shared party discovery or
  recipient private observer stream is modified.
- Grab/release, keyboard increments, cancellation and approved-step preview
  return to a final authorized sight frame. DM preview does not join the
  target player's private Realtime channel.

### 2. Responsive, bounded player prediction

- Phase 7 returns generation-bound, server-certified `predictionGrants`
  for up to eight currently visible owned tokens.
- Each YES-only quadrant represents an entire collision-free footprint
  envelope; concealed wall coordinates are not disclosed. With fog on,
  all relevant neighboring cells must already be visible.
- Unknown edges, ungranted directions, forged metadata, stale generation,
  multi-cell jumps and invalid ownership fail closed.
- The client may immediately paint fractional movement inside a grant.
  Every actual tile step still traverses the independent V2 server
  begin/advance/commit authority and complete swept collision check.

### 3. Static and moving light parity

- Static DM map light is clipped by wall/door/window geometry, including
  around wall endpoints and curtained windows. Malformed/oversized
  geometries fail closed.
- Moving torches use server canonical/approved tool or carried-token
  positions, never client-claimed source coordinates.
- On the DM board, moving torch positions are DM-only sight metadata and
  glow fans use published DM-authorized wall geometry.
- For players, a bounded `lightCells` intensity band array is derived
  **only** from the server's currently authorized visible cells and
  light-ray occlusion. Player frames contain no DM source positions,
  raw wall data or torch identity. Cosmetics do not grant fog vision.
- One permanent light canvas, below the final authoritative fog mask,
  draws only when the authorized lighting frame changes. A viewer's
  unchanged light frames do not incur extra sprite repaints or RAF loops.
- DM motion-linked light refreshes are throttled through the existing
  V2 private observer pipeline, without creating another subscription.

### 4. Legacy movement bridge retired for V2

- The V2 `commit_world_motion_v2` function no longer sets
  `forge.trajectory_steps`, `forge.trajectory_map`,
  `forge.trajectory_actor` or `forge.collision_override`.
- Instead, after locking every selected token/tool row and independently
  revalidating the accepted route, the server creates a **private
  transaction-scoped commit checkpoint**. Existing collision triggers
  confirm exact actor, campaign, map, source and approved endpoint for
  each selected row. The checkpoint is removed before returning success.
- The checkpoint schema has RLS enabled and no anonymous/authenticated
  table access. Its authorization helper is not executable by browser
  roles; a client-set GUC cannot forge the checkpoint.
- A compatibility migration updates the old token/tool collision triggers
  to recognize this V2 checkpoint while preserving their existing
  legacy-board movement/trajectory fallback and DM-only override.
- This is an **intentional temporary dual-compatible SQL implementation**:
  legacy trigger RPCs cannot be dropped safely while the current
  production board still relies on them. The V2 runtime itself never
  calls the legacy trajectory path. Only after approval and proven V2
  runtime acceptance may a separate explicitly scoped migration delete
  the now-unused legacy fallback. Do not remove it before the cutover.

## Eight coordinated, currently UNAPPLIED database migrations

Apply in ascending timestamp order only as part of the designer-approved
integrated release, after verifying the latest live schema and resolving
any pending staged bundle conflicts:

1. `20261109095000_world_engine_v2_motion_authority.sql`
2. `20261109100000_world_engine_v2_private_observer_stream.sql`
3. `20261109101000_world_engine_v2_static_scene_publication.sql`
4. `20261109102000_world_engine_v2_vision_geometry.sql`
5. `20261109102100_world_engine_v2_visibility_snapshots.sql`
6. `20261109102200_world_engine_v2_visibility_invalidation.sql`
7. `20261109102300_world_engine_v2_vision_roster_invalidation.sql`
8. `20261109103000_world_engine_v2_legacy_commit_checkpoint.sql`

The last migration updates existing collision functions, **not** their
trigger bindings, minimizing disruption to the old board.

## Automated checks, release gates and what cannot be asserted yet

- Frontend Node tests and Vite build via `Verify staged tabletop changes`.
- Disposable PostgreSQL 17: actor ownership, cross-player protection,
  authorization revocation, wall/door collision, mixed group atomics,
  static and moving light/LOS, DM virtual preview isolation,
  checkpoint privilege/lifetime, non-GUC V2 commit and **actual legacy
  collision-trigger function compatibility**.
- CodeQL JavaScript/TypeScript analysis, strict frontend build and dependency
  checks via GitHub workflows.
- Record the *exact final SHA* and all three workflow results. Never use
  an older green check to certify a newer commit.
- **Not yet possible without explicit deployment approval:** two-player plus
  DM real-browser stress test, measured grab-to-paint and observer-to-paint
  latency distributions, frame budgets and tear-down counts, Supabase Free
  CPU/RSS/WAL memory profiling, reconnect/revocation under packet loss,
  torch handoffs and open/closed doors, large-map scenes, full sheet/tool/
  status/handout interface parity.
- A passing synthetic SQL fixture does not prove that production migrations
  have been applied, that browser responsiveness is acceptable, or that
  production Supabase memory commitment has improved.
- PR #58 stays **draft**, cutover flags off, all staged features considered in
  the next single integrated release. Do not deploy Vercel or SQL without
  designer release approval.

## Release verification checklist

1. Audit current `main` and **all** pending release-ledger branches for
   staged conflicts; resolve overlaps and preserve all release-ready work.
2. Reconcile live Supabase baseline with these eight unapplied migrations.
   Review RLS, function-grant changes, dependency order and fallback/rollback.
3. Re-run full PR-head frontend/PG17/CodeQL checks and security review.
4. Obtain designer approval for ONE coordinated cutover, not intermediate
   deployments. Apply approved backend compatibility migrations first,
   then the consolidated frontend, and enable both V2 flags together.
5. With designer-controlled test campaigns, verify DM and multiple players,
   multi-token and tool gestures, moving torches, fog transitions, hiding,
   door collisions, sheet controls and network fault recovery. Record p50/p95
   latency, frames, CPU, memory, WAL and subscription count; block acceptance
   if security, performance or functionality regresses.
6. Keep legacy trigger fallback available until V2 acceptance is proven.
   Only then design a separate safe legacy code/SQL deletion release.

**Phase 10 implementation is staged; production and real-world performance
acceptance is deliberately not claimed.**
