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
