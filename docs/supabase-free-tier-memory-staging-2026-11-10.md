# Free-tier Supabase resource optimization staging — 10 November 2026

**Staged branch:** `stage/supabase-free-tier-memory-optimizations-2026-11-10` based on merged World Engine V2 and PR #59 startup hotfix. **Unreleased**. No production migration, pool configuration, Vercel deployment, or load test has been executed.

## Audited production baseline

- PostgreSQL database 19 MB, 33 backend processes/connections, 23 idle, 11 idle PostgREST and max_connections 60; 224 MB shared_buffers.
- Dashboard showed 402 MB memory including cache and buffers, 370 MB swap allocated, and 1.36 GB committed. Committed memory != resident RAM; allocated swap != active swap-I/O.
- pg_stat_statements last reset 2026-11-05. Realtime logical decoding 333,879 calls (~1 call/sec over this interval), monitor 3,068 calls / 97.6 ms mean, encumbrance 3,033 / 65.9 ms mean, legacy fog 2,013 / 92.3 ms mean. These are cumulative, NOT contemporaneous request rates.
- There are 13 current RLS initPlan lint warnings, and 36 unindexed FK notices, none on a large user table yet.

## Staged optimizations

1. Single `campaigns` PostgreSQL Changes subscription replaces a duplicate routing listener; player map assignments and private broadcasts remain.
2. Authorized, already-known cosmetic/status token updates still fetch token metadata but skip expensive monitor and encumbrance RPCs. New, missing, private NPC, ownership and visibility changes conservatively refresh both.
3. Chat bursts coalesce for 65ms, Presence roster sync bursts for 150ms. Immediate reconnect/focus reconciliation and subscription cleanup remain.
4. An **unapplied** migration hoists non-row-dependent `auth.uid()` into per-statement initPlans on 13 performance-advisor-flagged policies, including both private observer topics. It does not add grants, disable RLS or broaden predicates.
5. Added boundary tests and read-only `staging/verification/free-tier-memory-baseline.sql` queries. Existing `verify-staged.yml` runs unit tests, critical lint, build and audit on every staging push/PR.

## Explicit safety decisions

- `map_tokens` PostgreSQL Changes remains in V2 for non-positional status/sheet metadata. A security-equivalent private server notification channel is prerequisite to removing it; disabling it now would break multiplayer metadata updates.
- V2 collision, fog, movement, scene transport and authorization have not been touched.
- The 17 Realtime publication tables remain. Most of the measured ~333k decoder calls may reflect the service's ongoing replication polling, rather than client subscription churn. It is incorrect to promise large RAM savings from deleting channels.
- Do **not** add all 36 advisor-suggested FK indexes on 19 MB database. Record plans for specific expensive predicates and justify each index against write amplification / WAL / RAM.
- Do **not** change `max_connections`, pool sizes, `shared_buffers` or `work_mem` without observed pool saturation and actual resident-memory / swap paging evidence.
- No completed player authorization result is cached beyond its permission/vision generation.

## Required verification before release

1. Green `npm test`, `npm run lint:critical`, `npm run build`, security audit from GitHub PR checks.
2. Run RLS migration in an isolated PostgreSQL-17 environment populated with matching policy DDL. Compare DM/owner/outsider and private-topic authorizations for every policy before/after. **Source-contract tests do not replace DB permission tests.**
3. Captured idle baseline, then controlled 2/4/8 client sessions under approved test campaigns; use 10/50/100 tokens, repeat collision/fog/light variants at fixed duration. Capture memory commitment, actual RSS, swap-in/out, WAL, Realtime messages, per-user subscriptions, SQL deltas, p50/p95 player/DM movement latency, RLS denies, and WebSocket reconnects.
4. Confirm identical non-positional status/sheet/party-map behaviour, private fog isolation, DM controls, no token flashes, movement collision blocking, and no regression in hotbar or inventories.
5. Explicit designer approval before applying this migration or merging/deploying. Apply exactly once; check Supabase performance/security advisors afterward.

**Outcome criteria:** fewer monitor/encumbrance calls on cosmetic edits and fewer duplicate database subscriptions, with no permission leakage or performance regressions. Actual memory reductions are a hypothesis pending controlled measurements.

References: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select and https://supabase.com/docs/guides/realtime/postgres-changes#scaling-postgres-changes
