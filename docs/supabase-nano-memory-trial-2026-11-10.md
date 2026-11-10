# Nano free-tier PostgreSQL memory experiment (PR #61 staging)

**Status: NOT APPLIED.** This preparation is integrated into the currently staged World Engine V2 repair. It is not a database migration or automatic config override. No live restart, SQL change, production merge or deployment is authorized by this document.

## Live read-only baseline, 10 November 2026
PostgreSQL shared_buffers is 224 MB (28672 × 8 kB), postmaster context, pending_restart=false. Overall shared-memory allocations are about 270 MB; the database is only 19 MB. The latest supplied dashboard shows 403.54 MB total memory usage (including cache), 431.06 MB allocated swap and 1.45 GB committed memory. PostgreSQL connections number approximately 34 (mostly Supabase-managed). None of these proves an actual memory leak or sustained swap I/O.

## Candidate change
Test **shared_buffers = 128 MB** versus the existing 224 MB. This is a **96 MiB smaller configured buffer pool**, not a promise of 96 MiB lower physical resident memory. Fog, movement and frequent tile reads might become slower if the smaller cache increases disk I/O.

The project is on Nano/free compute. Supabase officially documents this parameter as configurable through the experimental CLI command, with an **automatic PostgreSQL restart**. Restart interrupts connections. A database migration, Vercel deploy, or SQL SET is not the mechanism to change shared_buffers.

Reference: https://supabase.com/docs/guides/database/custom-postgres-config

## Baseline, validation and rollback
1. Before any config change, capture 15 minutes idle plus fixed-duration 2-, 4- and 8-user sessions. Record latency p50/p95 for DM and player moves, WebSocket reconnects, authentication denials, fog/collision correctness, cache hit deltas, connection counts, runtime memory, commitment, allocated swap, and swap-in/swap-out activity.
2. Use staging/verification/nano-memory-preflight.sql for a lightweight read-only PostgreSQL snapshot before and after. pg_stat_database values are cumulative; compare deltas against known sample intervals. Host RSS and swap I/O must come from Supabase Reports, not SQL.
3. Before release, verify the current **exact CLI config overrides** using supabase postgres-config get. The pg_settings source='configuration file' does NOT distinguish an explicit override from a Supabase-managed default. Preserve that output safely outside the repo.
4. Require separate approval for the database restart. The script scripts/supabase-nano-memory-trial.sh defaults to inert help and blocks apply/rollback without explicit restart approval and backup. No automatic CI, SQL or Vercel process invokes it.
5. Trial 128 MB only; keep max_connections=60, work_mem, the Realtime replication slots, PostgREST pools, visibility/security functions and current World Engine V2 architecture intact. Never use --replace-existing-overrides or --no-restart.
6. Confirm the PostgreSQL restart and shared_buffers via pg_settings, confirm client reconnection, re-run authorized DM/player fog/movement and 2/4/8-user tests. Roll back for recurring connection losses, unauthorized visibility, persistent I/O stalls, or worse p95 movement latency. A possible acceptance gate is >=30 MB lower measured memory without worse latency; actual improvement is unknown.
7. For rollback, inspect the *saved CLI override list*. If shared_buffers had an explicit previous override, restore its exact value; if no override existed, delete **only** the shared_buffers override to return to Supabase-managed defaults. Rollback also restarts PostgreSQL.

### Optional guarded CLI procedure (not executed)
```bash
export TTRPG_NANO_OVERRIDE_BACKUP=/tmp/ttrpg-original-postgres-overrides.txt
bash scripts/supabase-nano-memory-trial.sh preflight
# Only with separately approved maintenance-window restart:
export TTRPG_NANO_RESTART_APPROVED=YES
bash scripts/supabase-nano-memory-trial.sh apply
# To reverse, choose prior literal size or 'default' based on saved backup:
export TTRPG_NANO_PREVIOUS_SHARED_BUFFERS=default
bash scripts/supabase-nano-memory-trial.sh rollback
```

## Integration boundary
This package changes no V2 engine, collision, fog, renderer, map, permissions, user sheets, or token subscription code. No SQL migrations were added. Keep the existing V2 repair ready as one integrated code release; the memory configuration restart is a **deferred** operation that must be approved and measured independently. Reducing PostgREST managed pool size, max_connections or dropping Realtime subscriptions is deferred until there is evidence it can be done without breaking functionality.
