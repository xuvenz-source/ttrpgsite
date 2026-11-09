# World Engine V2 — Phase 9 corrections and Phase 10 staging progress

**Status: DRAFT / WIP. No release authorization.** This document records
the cumulative changes in Draft PR #58. Existing production remains on
the legacy board. The two-setting cutover remains OFF. No V2 migration has
been applied to production Supabase; no Vercel deployment has been made.

## Phase 9 integration finalization

- Fixed board pointer capture: the input adapter no longer shadows the DOM
  target with an origin-point object. Real pointer capture now works.
- Fixed subsequent drag and tool handoff starting positions: use the
  server-authorized V2 viewer roster instead of potentially stale React
  token/tool coordinate metadata. Scene authority remains server-owned.
- DM player-effective preview does not mount full DM environment editing
  overlays (including quick-adjust controls).
- Existing renderer remains one mounted canvas stack, one animation owner and
  one React portal tree; no old fog/observer transport attaches from V2.
- Unified app keybindings no longer dispatch legacy position writers while
  the V2 board is active; the V2 board alone handles movement for bindings,
  with its duplicate arrow listener disabled.

## Phase 10 work staged

### A. DM virtual player preview — implementation staged

- Added a DM-only, non-mutating sight RPC:
  `preview_world_visibility_at_v2(map,viewer,token,x,y)`.
- SQL verifies actual campaign DM rights, a player-effective selected viewer,
  a visible player-owned token on the same map, finite bounded cell coordinates
  and no explored-history write permission.
- Virtual preview positions affect the selected vision source, carried light
  and returned viewer roster without writing `map_tokens`, a movement session,
  shared exploration or another player's private observer channel.
- Browser simulation uses DM-authenticated collision geometry and a
  noncommitting preview authority. Drag and arrow steps are supported.
- The preview does not grant a player access to DM environment geometry.
- Regression tests cover preview authorization, nonmutation, wall rejection
  and invalid token/position requests. Real multi-client parity still
  requires final browser testing.

### B. Safe player local prediction — implementation staged

- The server adds up to eight per-player owned-token
  `predictionGrants` to the authenticated V2 visibility frame.
- Each grant contains only collision-free fractional quadrants around the
  *current* visible actor position. A quadrant is certified with a
  collision test against an entire expanded footprint envelope, not a
  speculative endpoint or disclosed wall segment.
- With fog on, the relevant neighboring cells must already be visible.
  Client validation rejects stale map/scene/permission generations,
  misplaced actor anchors, forged extra fields, ungranted directions,
  oversized jumps and invalid/missing permissions.
- The renderer may present motion within a valid grant immediately;
  all actual grid steps still require the authoritative
  begin/advance/commit RPC and server revalidation.
- This is bounded first-cell prediction, **not** permission to render a
  multi-cell unseen trajectory. The grant-generation CPU cost and live
  latency require free-tier multiplayer profiling before release.

### C. Occlusion-clipped decorative light — partial

- Static map-light radial glows in the *DM-only* scene canvas now use
  a collision-style occlusion fan, respecting solid walls, open doors,
  window curtains and wall endpoints.
- Occlusion geometry is bounded; malformed or over-complex scenes fail
  closed and suppress the decorative glow instead of painting through
  a blocker.
- The player fog/light authorization remains exclusively in server SQL.
- **Still outstanding:** independently occlusion-clipped moving carried
  lights and a player-safe, server-authorized cosmetic light-intensity
  transport. Do not substitute raw wall/light geometry in the browser.

### D. Legacy retirement — partial and deliberately guarded

- Phase 9 V2 board has no imports of old collision, motion or fog owners.
- Phase 10 redirects app-wide movement shortcuts to V2 instead of the
  legacy keyboard movement writer when the cutover is selected.
- **Still outstanding:** replacement of the temporary Phase 4
  `forge.trajectory_*`/collision-trigger bridge and removal of remaining
  old-only code after feature parity and a migration-safe cutover.
- Do **not** drop production legacy triggers or RPCs while the old board
  remains the live default. A replacement must be tested in isolated
  PostgreSQL, alongside existing permissions and legacy-to-V2 transitions.
- No two active movement authorities should coexist for the same map.
  The existing two-setting hard cutover stays unchanged.

## Validation & release gates

- Frontend Node tests, Vite build, disposable PostgreSQL 17 integration
  workflow and CodeQL are the automated validation gates. Check the exact
  Draft PR head SHA for the current result; earlier commits passing is
  not proof of the next commit.
- Final verification must test two players and DM simultaneously, long
  mouse drags, consecutive grabs, multi-token movement, collisions at
  walls/doors/windows, hidden NPCs, carried light/torches, preview isolation,
  permissions revoked during drag, reconnection, handouts, map tools and
  custom keybindings.
- Record timing distributions (grab-to-paint, observer-to-paint,
  authorization latency), RAF frame budget, Supabase CPU/RSS/WAL and
  realtime subscription counts under the intended free-tier load.
- Complete dynamic light parity, legacy trigger retirement, conflict review
  and all checks **before** promoting PR #58 or changing cutover flags.
- Preserve the user's one-integrated-release policy. Staging changes must
  not trigger a production deployment or live SQL application.
