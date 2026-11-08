# Supabase and multiplayer performance optimization — staging integration

**Date:** 8 November 2026. **Status:** IN PROGRESS — code staged, not deployed.
**Base:** `stage/player-remote-reconciliation-2026-11-08` (PR #50, head `e780fa86340bf24424f5009645c51c3c2bc88dcf`), itself based on live PR #49 / `26765915deac294e154d1aeac05b23496d76de32`.

## Conflict audit and release boundary

- Source includes PR #50's timestamp-aware RLS token snapshots, final preview settlement, stable token/monitor refs, eager board artwork, and immediate fog reauthorization. This work is additive, not a revert of those fixes.
- The `main` release ledger marks older staged work as **released/superseded**, despite open historical draft PRs #20, #21, #32 and #33. Verify those historical PRs before eventual release, but do not replay obsolete SQL or re-merge already integrated code.
- The current unreleased chain is **PR #50 -> this branch**. This branch is designed to be reviewed as a stacked change and later combined in the *same* production release. No automatic merge, SQL migration application, Edge deploy, or Vercel deploy.
- Migration `20261108055943_world_runtime_single_write_trajectory` was verified installed on the existing database. It must not be re-applied. No new DDL or privileges in this performance stage.
- Supabase plan constraint: no paid database branches or infrastructure; no new production configuration change without evidence.

## Read-only baseline — what is measured and what is not

Read-only SQL and advisors on project `lwhwgqaunxbmvyndswze` returned:

| Measure | Result | Interpretation |
|---|---:|---|
| Project | ACTIVE_HEALTHY | Not proof of healthy latency |
| DB size | 16 MB | Dataset is small |
| Client backends sampled | 15 (14 idle, 1 active) | Point-in-time, not a peak |
| Total connections sampled in separate query | 17 | Includes other backend/session types |
| `max_connections` | 60 | Do not change blindly |
| Shared buffers | 224 MB | Configured shared memory, not physical RAM use |
| `get_token_monitor_values` | 2,361 calls, mean 53.5 ms | Cumulative `pg_stat_statements`, not windowed |
| `get_token_encumbrance_badges` | 2,322 calls, mean 31.1 ms | Cumulative `pg_stat_statements`, not windowed |
| `get_authorized_map_fog` | 944 calls, mean 22.3 ms | Cumulative `pg_stat_statements`, not windowed |
| `campaign_tool_map_tokens` select | 1,110 calls on one normalized query shape, mean 0.5 ms | Includes only this query form |
| Performance advisor | 33 unindexed FK notices | Investigate selectivity/EXPLAIN before any index |

Earlier dashboard showed 1.48 GB committed against a 1.36 GB threshold. **No new actual RAM/swap or memory-commitment measurement was available through the read-only SQL diagnostics.** Committed is not equivalent to actual RSS. No evidence supports an infrastructure upsell or adjusting `max_connections` today.

The cumulative SQL counts cannot be attributed to this implementation or a fixed play session. No before/after percentage or remote p95 improvement is claimed.

## Source-level root causes identified

1. Multiple calls to `refreshTokens()` and `refreshMonitors()` can overlap during fog, Realtime and authoritative reconciliation. Sequence IDs prevent late application but previously did **not** prevent repeated network requests.
2. `useCampaignTools` refetched templates, issues, and map placements as a single three-query batch for every individual tool placement, regardless of which table changed.
3. The tool hook rebuilt its Realtime subscription on map change due to closure coupling, though the filter is already campaign-scoped.
4. `useAuthorizedMapFog` can receive another RPC request while one already runs. Authorization invalidation must precede any deduplication.
5. Monitor and badge RPCs are relatively expensive; source currently recomputes both together for several triggers. This stage deduplicates overlapping reads, **but does not yet solve dependency-based invalidation across all callers**.

## Implemented in this branch

### CampaignRefreshCoordinator.js

- Explicit identity: campaign, map, viewer, resource and optional DM role variant.
- Share identical *in-flight* reads only. **Never cache completed authorization results**; do not create cross-viewer permission leaks.
- Invalidate a resource key immediately when Realtime, a local write, or authorized fog sight changes.
- Mark a late result `current:false`, so consumers cannot apply it after revocation.
- No timers, added movement latency, database DDL, or new subscriptions.
- Include local counters for started/shared/stale/failed requests to help future controlled instrumentation.

### TabletopApp.jsx

- One coordinator per campaign/map/user identity.
- Share overlapping token, monitor and encumbrance reads.
- Force new reads on changed authorized fog revisions or visibility masks rather than sharing a pre-revocation request.
- Retain existing RLS token snapshot merging, overlay reconciliation, observer previews, remote settling and direct next-frame local movement.
- Retain all PR #49 single-write trajectory SQL; position-only Realtime still paints targeted tokens.

### useAuthorizedMapFog.js

- Deduplicate concurrently requested same-viewer fog RPCs **only while authorization has not changed**.
- Invalidate in-flight fog request synchronously at sight revocation and on focus/cleanup. Existing fail-closed fog mask is applied before requesting a new frame.
- Preserve leading/immediate first authorized fog fetch and subsequent bounded coalescing. No server-side visibility logic changed.

### useCampaignTools.js

- Independent per-resource refresh versions; tool movement does not imply template reloads.
- Invalidate only issued/placed resource(s) for issue changes, placed for map-token changes, templates for template changes.
- Batch overlapping Realtime table notifications into one resource refresh.
- Preserve optimistic tool placements, per-issue serialized writes, held tool rules, DM overrides and RLS queries.
- Subscribe per campaign rather than per selected map. On resubscription/focus, reconcile authorized snapshots.
- Force new snapshots after writes and fog permission changes, even if an earlier read is still pending.

## Verification and quality gates

Automated tests:
- `tests/campaign-refresh-coordinator.test.mjs`: identical-flight suppression; separation across viewers/maps/campaigns; invalidated or out-of-order reads; reset/disposal; retry after failures.
- `tests/multiplayer-performance-integration.test.mjs`: static integration guard for optimistic movement, one-write trajectory call, fog fail-closed behavior, per-viewer read isolation, selective tool refresh and subscription cleanup.
- Updated `tests/audit-realtime-coalescing.test.mjs` to assert the new targeted tool batch while preserving handout/combat/fog checks.
- Preexisting `tests/player-remote-reconciliation.test.mjs`, `tests/live-token-movement.test.mjs`, fog/collision/RLS, shared inventory and other tests remain in the suite.

Run GitHub CI lint, Node tests, production npm audit, Vite build, Deno checks, CodeQL. **This is not enough to assert browser correctness.**

### Manual multiplayer acceptance matrix

Use existing controlled test campaigns **after explicit release/testing approval**. Record identical network and map settings for before/after.

| Clients | Tokens | Focus |
|---:|---:|---|
| 2 (DM+player) | 10 | Basic movement, fog, permission revocation |
| 4 | 50 | Simultaneous moves and sheet/item edits |
| 6–10 | 100 | Event bursts, remote movement p50/p95, reconnect |
| 2 / 4 / 6–10 | 10 / 50 / 100 | Full matrix; fog on/off and mixed tools |

For each: capture request counts by resource, in-flight duplicates, RPC p50/p95, local next-frame paint, authoritative commit/remote visual latency, FPS, React commits, memory/swap if independently accessible, fog denial latency, wall/door collision, group trajectory correctness, tool mount and inventory lease behaviors. Include tab background/foreground, network disconnection/reconnect, map switch and account switch.

**Targets, not results:** eliminate duplicate identical in-flight reads, 25–40% fewer unnecessary requests under equivalent workloads, no stale-authorized visibility, no increased p95 movement latency. Do not accept performance improvements if gameplay correctness worsens.

## Outstanding work and risks

- **Not complete:** a full dependency graph for inventory/attribute/status-driven monitor updates; narrow fog server SQL analysis; actual RAM/swap/connection-pool telemetry; selective SQL index EXPLAIN; dedicated browser stress measurements.
- Cross-resource callbacks still legitimately trigger multiple different resources. No reduction is guaranteed until measured.
- Fog revocation may still temporarily hide an unowned NPC pending an authenticated visibility response. This protects secrets; do not keep unauthorized artwork around.
- In-flight network calls cannot be canceled on the server; stale results are ignored in UI. Short Realtime bursts may cause some redundant requests if authorization changes midflight.
- SQL advisor has 33 FK notices; **do not install all 33 indexes blindly**.
- Existing deployed schema remains unchanged; no DB rollback necessary for this stage.

## Rollback / next release

This stage is based directly on PR #50. To drop only this optimization, omit/revert this branch and release PR #50 unchanged. Do not revert or replay PR #49's database trajectory migration. If later a combined frontend release reveals regressions, revert the coordinator integration and the tool hook split in one release; the existing full-refresh functions and single-write server API are compatible with the previous production schema. Verify all approved staged items and green CI before an authorized single main merge and single Vercel production deployment.
