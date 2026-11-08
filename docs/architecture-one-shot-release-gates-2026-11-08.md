# One-shot architectural release — staging acceptance and rollback

Updated: 2026-11-08. Release branch: `stage/movement-fog-realtime-memory-redesign-2026-11-08`.
**This is a complete staged implementation attempt, not a claim of proven performance.**
The designer has not authorized any production SQL or deployment.

## Consolidated scope

1. Rendering: keep fog/map canvas mounted on protocol negotiation; per-player light-mask revision parity; only a newer server-approved fog frame plus freshly RLS-filtered token/tool rows can unhide stale observer markers; retire hidden markers that are absent from a newer authorized roster.
2. Server motion: short-lived, opaque, server-owned gesture sessions; cached published collision geometry and grid parameters, authorisation on every segment, current scene/rules/grid/actor re-check, swept wall checks, private observer LOS and ordered sequences. All final writes still use the installed authoritative saved trajectory system.
3. Visibility: per-viewer server-owned epoch/revision/sequence, bounded full snapshot with delta and noop responses, checked revisions and full snapshot fallback; frontend applies only explicit server-returned cell changes and still re-queries row-level-filtered token and tool entities. Hidden NPC IDs are never exposed in public broadcasts.
4. Resource usage: avoid per-waypoint map_tokens writes, eliminate legacy per-preview dispatch calls from the new frontend, reuse validated collision/LOS scene per observer, dedupe unchanged fog frames, retain one snapshot per map/viewer and bounded hidden-state/metric storage. No PostgreSQL connection cap or compute-size changes.

## Production migration dependency order (ONLY after explicit designer approval)

1. Confirm `main` still matches staged branch base; reconcile all other outstanding ready work, migration history and Vercel quota. If main moved, rebase and retest.
2. Apply additive `staging/sql-candidates/viewer_light_masks_v2.sql` through a tracked migration. It retains the pre-existing light masks RPC.
3. Apply `staging/sql-candidates/observer_path_cached_scene.sql` BEFORE session functions. This private helper reuses the server validated scene; no authenticated/anon EXECUTE.
4. Apply `staging/sql-candidates/movement_sessions_and_visibility_delta.sql` through an official versioned migration. It adds two private RLS tables and four authenticated RPCs; leaves the legacy preview, v2 fog, trajectory and Realtime publication unchanged.
5. Verify installed definitions, `pg_proc.prosecdef`, SQL EXECUTE grants, private schema exposure, RLS and Realtime topics, and functional role tests with approved test campaigns.
6. Deploy the matching frontend in **one** production update, including all other release-ready staged changes. Verify exact Vercel production commit. Do not publish a frontend that calls missing server RPCs.
7. Test in live using existing test campaigns, as established in `docs/development-workflow.md`. No paid development database or preview branch.

## Required functional and security matrix

- DM, player, foreign player and signed-out requests: own token, foreign token, hidden NPC, held/shared tool, private map. Non-owners must not begin or advance a session, and a former owner must be denied immediately after ownership/routing changes.
- Wall, closed/open/broken door, one-way vision, token footprint, diagonal sweep, collision-exempt DM gesture, map calibration and published environment update mid-drag, dropped packet, reordered seq, gesture expiry, cancellation/reconnect and two simultaneous movers.
- Party-shared and individual fog on/off, hidden NPC leaving and reentering view (including **stationary** reveal), torch carried/moving, light clipped by walls, global/per-player revision mismatch, subscription error/downgrade, old epoch delta, bad mask, missing sequence and full snapshot fallback.
- Group movement of tokens plus tools. Final write must still be server-authorized and atomic.
- Check no public client broadcast can impersonate server private `forge-observer:<map>:<viewer>` topic or show hidden coordinates. No RPC may leak private wall/scene JSON to players.

## Performance gates

Use 2, 4 and 6–10 connected clients and 10, 50 and 100 tokens under matching test maps with fog on/off. Record:

- local pointer-to-render, remote pointer-to-visible-position p50/p95 (target <200 ms p95 in normal conditions);
- full map black flashes (target zero), unintended token artwork remounts (zero);
- `__ttrpgMovementMetrics()` in each test browser, where it exposes only aggregate RPC durations;
- before/after `staging/sql-candidates/read_only_architecture_stress_metrics.sql` snapshots: call counts, cumulative SQL time, `pg_stat_activity`, WAL/temp blocks and table health;
- dashboard *committed memory, actual RAM, swap* and PostgREST pool occupancy, and Realtime messages/sec. Memory commitment is not physical RAM. No unexplained sustained memory growth.

Automated GitHub tests/build/audit/Deno/CodeQL are necessary, but cannot certify Postgres SQL compilation, multiplayer latency, RLS role behavior or physical-memory results without an approved live trial. Reject release if authorization or collision security regresses.

## Rollback

Rollback the client FIRST to PR #52's known-good legacy v2 fog/preview frontend while keeping the new additive backend RPCs temporarily available. Verify old client works. Then apply `staging/sql-candidates/rollback_movement_sessions_and_visibility_delta.sql` and `staging/sql-candidates/rollback_viewer_light_masks_v2.sql` in that order. Do not drop the legacy `preview_map_motion`, `get_authorized_map_fog_v2`, `get_authorized_map_light_masks`, `move_map_group`, existing tables/ticks or authorisation policies. Expiring sessions and newly added fog snapshot cache contain only ephemeral data; rollback of those two newly introduced tables loses no campaign data.

## Unverified until an approved release

- New SQL is an unapplied candidate; no live PostgreSQL function compilation yet.
- Multi-browser latency, zero-flash, full collision/role matrix and before/after memory commitment require actual live testing.
- Phase completion means implementation is staged as a **full attempt**, not that engineering targets are already achieved.
