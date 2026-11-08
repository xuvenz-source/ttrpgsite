# Free-plan Supabase performance baseline — 2026-11-08

**Read-only production observation.** No SQL DDL, table changes, session termination, config changes, paid services or synthetic test traffic used.

Database: Supabase Free, PostgreSQL 17.11, ~17 MB data. `pg_stat_statements_info.stats_reset`: `2026-11-05 09:51:43 UTC`. These are **cumulative** values since reset, **not** a controlled test of current user experience.

| Observed API statement family | Calls | Total SQL execution | Mean SQL time | Max SQL time |
| --- | ---: | ---: | ---: | ---: |
| Legacy authorized fog (`get_authorized_map_fog`) | 1,408 | 153,920.5 ms | 109.3 ms | 5,139.9 ms |
| Server-authorized movement preview (`preview_map_motion`) | 113 | 43,327.3 ms | 383.4 ms | 7,165.7 ms |
| Viewer fog v2 (`get_authorized_map_fog_v2`) | 33 | 5,458.3 ms | 165.4 ms | 1,980.7 ms |
| Authorized light masks | 1 | 3,105.9 ms | 3,105.9 ms | 3,105.9 ms |

**At one point-in-time**: 31 total PostgreSQL processes/connections, 21 idle, 11 idle PostgREST 14.18 sessions, `max_connections=60`. These readings should not be conflated with 31 concurrently running requests or evidence of a leak.

**Supabase advisor** reported 34 informational unindexed foreign keys. This is NOT evidence to create 34 indexes: choose from high-cost query plans and actual table size/cardinality, balancing write/WAL cost.

## Interpretation / diagnostic priorities

- Preview RPC is a significant bottleneck candidate because it serializes in `ObserverPreviewQueue` and must perform collision, per-viewer visibility and broadcast work; query time is only part of remote latency.
- Existing fog calls dominate sampled accumulated SQL execution, so avoid repeated full frames on every intermediate preview or reconnect. A large historical call count does not establish that every query is redundant.
- One slow lighting call is **not statistically representative**, but confirms why the light protocol should be version-correct and dependency-aware.
- Physical RAM and swap, current memory commitment, PostgREST pool occupancy, per-move request rate, WAL/temporary blocks, and realtime publication load remain **unmeasured**. Do not claim the memory issue is solved or a leak is confirmed.
- Do not lower `max_connections` without pool occupancy and load evidence.

## Controlled follow-up gates

Collect idle baseline; repeat test for 2/4/6–10 connected clients with 10, 50 and 100 map tokens. Record p50/p95 local pointer-to-paint and remote move-to-paint, SQL calls per gesture, `pg_stat_statements` deltas, sessions by application and state, `temp_blks_written`, WAL generation, API error rate, Realtime event volume, **physical RAM/swap** and dashboard committed memory. Compare over identical gesture duration with fog on/off and light/door/collision variants. No separate paid database platform; approved test campaigns only.

Source: read-only `pg_stat_activity`, `pg_stat_statements`, `pg_stat_statements_info` and Supabase performance advisors through connected project. Screenshots and dashboard metrics remain needed for committed/physical memory.
