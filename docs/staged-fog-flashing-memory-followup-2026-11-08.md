# Live follow-up: fog token flashing and memory commitment — 8 November 2026

**Staging only, not released**. Base: production `309e96c7b3ca6550e491392d9e32ba5189497175`, PR #51 verified READY on Vercel. No database write, migrations, RLS changes, privilege changes, paid infrastructure, or Vercel preview/deploy.

## Evidence gathered (read-only, point-in-time)
- Supabase project ACTIVE_HEALTHY, approximately 16 MB database size.
- `pg_stat_activity`: 37 total processes/connections in a sample, 27 idle, 2 active. Maximum configured connections: 60. PostgreSQL shared buffers: 224 MB. Connection counts are dynamic and no process memory or RAM/swap bytes were available via SQL.
- UI screenshot shows about 1.37 GB memory **commitment** over one hour with a flat-ish plateau. Commitment is not the same as physical RAM utilisation. The severe alarm additionally references RAM above 90% in the same interval. Check actual used/cache/swap graphs before deciding on configuration changes.
- `pg_stat_statements` query families reported roughly 2,421 calls / 65.9 ms average for monitor values, 2,382 calls / 39.8 ms average for encumbrance badges, and 1,009 calls / 63.2 ms average for authorized fog. These counts are **cumulative**, not a 1-hour rate. They do not prove a leak or attribute workload to any particular client.
- Live `forge_visibility.tick_tokens`: for pure x/y movement on fog-enabled maps, `bump_tick()` increments a server visibility revision. Player clients treat a fresh revision as an immediate sight revocation and hide unowned token artwork until the new authorized `get_authorized_map_fog` response. This is security-preserving but explains player-side flicker. DM clients do not share the same hide path.

## Narrow fix staged in this PR
- The previous player handler evaluated every tick against only the *last confirmed* visibility revision. When several notifications carried the *same unconfirmed* revision, they could repeatedly invalidate the in-flight RPC and prolong the hidden-token interval.
- Track the **highest pending tick** (map/revision/fog mode) per hook. Ignore duplicates and older pending ticks for the same map/mode. A newer revision, fog-mode toggle, unrecognized event, map/account change, reconnect or failure still fails closed and starts a new authorized read.
- Add pure tests for duplicate, higher, mode-changed, malformed and cross-map events, and a hook integration guard.
- This fixes **one source of avoidable extra requests and prolonged hiding**, not all player flickering. One genuine fog-changing tick can still temporarily hide an unowned NPC. Never retain unauthorized sprites to conceal that gap.

## Next required improvement (not implemented in this PR)
1. Instrument a controlled 2/4/6–10 browser matrix to differentiate fog-hidden token disappearance, actual React mount/unmount, image decode, and remote transform rebase. Measure visible tick -> RPC p50/p95; count redundant fog/monitor/badge calls over a fixed session.
2. Redesign the authoritative visibility flow so **non-sight-changing movement** does not trigger needless revocation. This requires a server-attested per-viewer visibility delta or equivalent version confirmation; never infer permission from the client or skip tick checks on faith.
3. Preserve collision validation, owned-token permission checks, group atomic trajectory commits, fog RLS, previews, tool lighting and map switching. Keep the single-write trajectory design.
4. On Supabase, establish actual physical RAM, swap, cache/buffer, and concurrent connection trends. Examine specific expensive RPC plans and their RLS/index dependencies, avoid adding all 33 advised FK indexes blindly. Reduce unnecessary monitor/badge refreshes according to dependency triggers before adjusting managed connection pool or memory settings.
5. Accept only after multiplayer live testing demonstrates no visual flash for unchanged-authority moves, correct removal of newly hidden NPCs, no position rubber band, no worse p95 movement, and lower request volume in a matched session. User approval is required before a consolidated production release.

## Rollback
Revert the frontend helper and hook changes only; previous authorization boundaries and database behaviour remain unchanged. No SQL rollback.


## Follow-up after the 18:05–19:04 AEDT stress-test graph — staged code extension

**Latest screenshot:** Linux memory commitment ~1.54 GB versus prior ~1.37 GB; an increase of about 170 MB, remaining above the dashboard's severe threshold. Screenshot alone does not give actual RAM RSS, swap, CPU, OOM history, or the exact kernel commit limit. Do not claim memory savings until monitored after an approved release.

**Read-only Supabase snapshot at 2026-11-08 08:09 UTC:**
- Postgres 39 total processes/connections, 29 idle, 2 active, no idle-in-transaction or lock waiters at that instant. Max allowed 60; `shared_buffers` 224 MB, `work_mem` 2184 kB, `maintenance_work_mem` 32 MB.
- 11 idle PostgREST authenticator sessions, five idle Storage API sessions, four idle pgbouncer sessions, plus Realtime and monitoring workers. Connection count is **not a historical peak** and does not prove the rise in committed memory came from extra connections.
- Current `pg_stat_statements` totals: 2,753 token monitor calls / 96.6 ms cumulative mean; 2,717 badge calls / 66.4 ms mean; 1,331 fog calls / 113.9 ms mean; 103 secure preview calls / 392.6 ms mean; 76 authoritative trajectory calls / 301.6 ms mean. Statement counters have a shared stats-reset timestamp from before project creation; these are not windowed.
- Relative to prior sampled cumulative statements (~2,421 monitor / 65.9 ms, 2,382 badge / 39.8 ms, 1,009 fog / 63.2 ms), approximate *delta of cumulative total execution time divided by delta call count* is ~320 ms for monitor (332 calls), ~255 ms for badge (335 calls), and ~273 ms for fog (322 calls). These estimates are not per-session p95s. Workloads may overlap during measurement.
- Unified logs show API gateway bursts around 07:50 and 08:00 UTC (18:50 and 19:00 AEDT), connection churn at the same moments, and three PostgreSQL statement-timeout messages within the reviewed hour. Aggregated log records are not necessarily unique requests.

### Extension to the PR: dependency-aware derived refresh

The `TabletopApp.jsx` fog revision and changed-LOS effects previously invoked `refreshTokens(true)`, `refreshMonitors(true)`, and `campaignTools.refresh(undefined,true)` on every authorized sight revision. The monitor function actually runs TWO comparatively expensive RLS/derived SQL RPCs, independently for every player.

The stage introduces `authorizedTokenDerivedInputsChanged` and `refreshFogAwareTokens()`:
1. Fetch a **new RLS-filtered token snapshot** on each valid fog revision or changed preview sight. Continue to refresh tools under their own authorization. No stale token snapshot is trusted.
2. After the fresh server snapshot is received and its viewer/map/campaign context validated, refresh both monitor/badge resources **only if** the authorized token set changes, or monitor-disclosure metadata (owner, visibility, character link, public NPC bars) changes.
3. Moves that only change coordinates therefore do not invoke the two costly derived RPCs; ordinary sheet changes, `monitors-changed` broadcasts, non-coordinate token events, initial map load, and campaign display-settings updates retain their existing refresh paths.
4. Unknown or malformed authorized input conservatively forces a full refresh, not a guessed permission grant. The helper never makes an authorization decision based on a movement preview.
5. Add pure test coverage for movement-only, reordered roster, newly seen/hidden token, monitor disclosure, malformed snapshots, and static integration guards.

**Expected impact (not yet measured):** A significant reduction in monitor and encumbrance calls in fog-heavy movements with unchanged authorized token membership. This does **not** remove fog RPCs, secure movement-preview CPU, pre-existing idle database backends, or committed RAM instantaneously.

### Next architectural work necessary for a complete memory-risk solution
- **Backpressure:** Profile `preview_map_motion` (mean ~393 ms in cumulative statement sample) and `commit_map_trajectory` (~302 ms). Keep collision/visibility validation and live observer authenticity, but reduce repeated permission/LOS calculations and stale preview work. Batching or per-viewer server-attested deltas is a planned design, not a shipped fix.
- **Managed connection pool:** Supabase's memory commitment documentation explains fork-based backend shared-memory commit inflation. Analyze *peak* PostgREST and pooled direct connections, actual used RAM/swap, and request p95. Then prepare a **reversible, small step-down** of the PostgREST API pool size in the Supabase dashboard if active usage leaves sufficient headroom. We have not measured enough to recommend an exact safe pool size. Do not alter `max_connections` or service settings blindly.
- **Prioritization:** Reduce high-cost SQL work and verify movement p95 before adding indexes. The existing Supabase performance advisor flags 33 foreign keys, but broad indexes cannot be justified from this evidence.
- **No expensive environments:** continue with existing live test campaigns only after designer approval; no paid Supabase branch, compute upgrade or preview deployment.
- **Acceptance:** compare matched 2/4/6–10 connected clients and 10/50/100 tokens; track DB RPC call delta by family, fresh vs repeated fog ticks, sampled connection high-water mark, kernel memory commitment, *physical* used RAM and swap, PostgREST pool occupancy, and 95th percentile movement / fog latency. Verify no accidental exposure of hidden NPC values or bars. Memory should fall with workload/connection stabilization; if it does not, investigate backend process retention separately rather than asserting this code fix solved it.

See also [Supabase memory commitment reporting](https://supabase.com/docs/guides/observability/reports) and [connection management](https://supabase.com/docs/guides/database/connection-management).
