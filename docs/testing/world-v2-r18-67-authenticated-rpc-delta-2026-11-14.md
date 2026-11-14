# R18-67 — Separate fresh movement RPC latency from old cumulative stats

**14 November 2026 · Read-only source/test stage · no production deployment or migration.**

## Why this exists

The actual live Supabase `extensions.pg_stat_statements` data shows a concrete movement cost, with stats last reset **2026-11-05 09:51:43 UTC**, not at the time the user reports lag. For the actual **`authenticated`** PostgreSQL role, the historical roll-up was:

| RPC family | Historical authenticated calls | Cumulative weighted mean database time | Historical maximum |
|---|---:|---:|---:|
| Commit | 514 | **292.46 ms** | **3,673.7 ms** |
| Advance | 1,756 | 64.14 ms | 2,256.4 ms |
| Visibility | 1,387 | 43.53 ms | 1,917.2 ms |
| Begin | 612 | 25.40 ms | 743.6 ms |

These are **database execution times**, not client-to-server round trips, per-frame rates, percentile latencies, or an isolated DM/P1/P2 session. They span past traffic; never call these a present-day p95 or say that a single movement always takes 292 ms.

The installed original `public.commit_world_motion_v2` function has explicit per-accepted-step `forge_world_v2.step_allowed(...)` revalidation before canonical token/tool updates, plus token-update collision and fog/visibility triggers. This explains plausible scaling with long movement routes, but `pg_stat_statements` with `track_functions=none` cannot attribute each millisecond to an internal routine. Do **not** remove per-step collision, session validation, row locks, fog authorization, or checkpoints to make a synthetic benchmark fast.

## Fresh capture protocol — no login, IDs, or DevTools exports required for SQL

1. Preserve the exact reviewed source commit, database state, and existing Vercel environment. Run **only** the SELECT statement from `supabase/release-preflight/world_v2_b10_r18_67_authenticated_rpc_counters.sql` in an authorized read-only Supabase SQL editor connection. It returns a single `world_v2_performance_snapshot` JSON object; no raw normalized SQL text, per-user IDs, coordinates, session data, or credentials. Save the whole JSON object as `/secure/private/r67-before.json` **outside the source checkout**.
2. Separately, on an explicitly approved integrated test deployment **after** the official linked 83+8 read-only CLI gate and any separately authorized migration installation, have a real DM, independently signed P1, and passive P2 perform a bounded known scenario: keyboard rapid movement, dragged corners, wall collision, quick regrab, note pins, reconnect, fog/LOS revocation. Collect bounded opt-in R18-59 role receipts and browser RPC p50/p95 from the *actual clients*. **The current R18-63 preview remains OAuth-only and uses the legacy engine; it is not a valid V2 stress test.**
3. Immediately afterward run the **same unchanged SELECT** in the same database and save `/secure/private/r67-after.json` outside the repo. Use a measurement window no longer than **6 hours**, preferably minutes. Capture any Supabase Free RAM/CPU dashboard trend and waiting locks at the same times. Do not disable staging SSO or change feature flags to obtain measurements.
4. Run the *offline* comparison from the reviewed repo checkout:

```bash
node scripts/release/validate-world-v2-r18-67-rpc-window.mjs \
  --before=/secure/private/r67-before.json \
  --after=/secure/private/r67-after.json
```

The input files may be either the raw JSON snapshot object or the one-row SQL result wrapper. The validator checks strict allowlists and types, identical `stats_reset`, chronological capture times, monotonic counters and no extra private fields. It returns the **new call count** and **new database execution-time mean** for each of Begin, Advance, Commit and Visibility. A family with no calls returns `NO_SAMPLE` and `meanDatabaseExecMs:null`, not a bogus zero-latency pass. It never computes p95; the output explicitly has `p95DatabaseMs:null` and `browserRttP95Ms:null` because aggregates do not support percentiles. The result always says `decision:NO_GO` and `safeToDeploy:false`; it is a diagnostic only.

Use a new before snapshot if PostgreSQL restarts or `pg_stat_statements` is reset; otherwise the comparison is **invalid**, not a new performance improvement. These counters include all authenticated use of these same RPCs in the observation window and cannot distinguish one user's movement from other concurrent traffic. For a clean experiment, run the bounded test while unrelated traffic is minimal and cross-check with independent client traces.

## Exact engineering scope

Only one read-only SQL file in `supabase/release-preflight/`, one offline Node validator in `scripts/release/`, its adversarial Node unit tests, and this documentation. No edits to `supabase/migrations/`, active RPC definitions, collision, fog, permissions, environment flags or Vercel. No changes to production.

**Known separate gates:** Google preview OAuth PASS, 83/83 original migration bodies and 10/10 authority function hash baseline PASS, 8/8 frozen pending source hashes PASS. The official **authenticated Supabase CLI v2.81.3** exact 83+8 fetch/list/`db push --dry-run` still has **not** run, because there is no linked CLI credential available in ChatGPT's runner. Independently signed DM/P1/passive P2 full fog/movement test, free-tier load, source-real full release acceptance and explicit human authorization are **NO-GO**.

## Safety and limitations

The statement accesses `pg_stat_statements` through an authorized role. It uses a read-only SELECT and returns only non-sensitive numeric aggregate counters, with a fixed `db_role:'authenticated'` label. Results are cumulative from `stats_reset`; the delta validator rejects resets, decreasing counters, stale/max-6-hour windows and injected keys. This does not claim the separate optional R18-57 fog optimization eliminates 292 ms Commit time. That change is still opt-in, uninstalled and separately security gated.

**Do not lower authoritative collision checks, open fog/private RPC permissions, run unguarded `db push`, or merge the draft release chain based on these statistics.**
