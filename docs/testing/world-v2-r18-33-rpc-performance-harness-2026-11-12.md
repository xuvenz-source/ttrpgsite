# B10-R18-33 — Source-real collision and terminal-RPC benchmark

**12 November 2026 (Australia/Melbourne). STAGING ONLY. No live deploy, Supabase migration, paid service, environment flag or permission change.**

## Reason and factual baseline

The DM observed worse lag after isolated R18-32, especially against collision and during fast drag/keyboard inputs. R18-32 was rolled back to the previously reviewed R18-31 frontend source `d94985e1135822953c9f67d9b46d238facaaaa1f` (Vercel `dpl_DCyZdsSTjmvbT5YnMK7sjbzGTgem`). Live Supabase continues with **83 registered migrations** and has NOT installed frozen R05 `20261111023204`, R18-28/R18-30 finalization or the R18-26/27 SQL candidates.

Latest user browser trace: 37 Advance RPC samples, p50 263.5ms / p95 574.6ms / max 990.3ms; seven canonical Commit RPC samples, p50 1075ms / p95 1351.2ms; release-to-terminal p95 2347.2ms. Instrumented render.frame p95 0.1ms is **not** full browser-frame profiling. Historical top-level `pg_stat_statements`, accumulated since 5 November, measured Advance mean DB execution about 60ms and Commit about 235ms, with much worse tails. **These cohorts are not temporally paired and must not be subtracted to infer network or trigger-specific latency.** Live `track_functions=none`; no individual trigger timing has been measured. Ten application-defined map-token triggers exist.

## Scope

Exactly one new test-only `tests/world-v2-b10-postgres/performance-r18-33.sql` and Node source contract, one invocation added to the existing disposable `rehearse-r18-22.sh` script. No runtime/client/source SQL candidate changed.

The PG17 harness begins with actual installed-in-fixture R05 + R18-17/19/20. The first six-iteration sample set executes authorized:
1. Two-cell accepted movement toward a 5% shallow wall edge and real canonical Commit.
2. Immediate attempt into a solid wall (blocked Advance with no Commit). The isolated fixture does not load the live Cancel RPC, so baseline cancellation overhead is explicitly excluded; the still-provisional session is rolled back with the whole transaction.
3. Authenticated reversal using Begin/Advance/Commit, not a test-only token UPDATE.
4. Eight alternating approved Advance batches within one session and a full-route canonical Commit.

In the *same rollback-only transaction*, the harness overlays the unchanged R18-26 wall bounding prefilter, R18-27 empty-work Commit, R18-28 atomic finalization and R18-30 blocked-only terminal receipt. It repeats those four cases six times via Begin+Finalize and (for the eight-advance case) seven ordinary Advance calls plus final atomic Advance/Commit. It asserts each server-approved step and exact final canonical token coordinate, zero-motion wall receipts, preserved authenticated-only public finalizer/private-schema restrictions, and exact rollback of all temporary data, new RPC and test schema changes.

The benchmark reports 48 per-scenario timings (6 repetitions × 4 scenarios × 2 variants), with mean, p50, p95 and max. These are SQL-local, serial, low-sample, single-actor fixture results. The blocked baseline and staged no-motion finalizer are not identical terminal lifecycles because cancellation is omitted on the baseline. **There is intentionally no CI speedup threshold and no extrapolation to production browser RTT or independent signed multiplayer/fog performance.** Captured SQL times exclude HTTPS round trips; the two variants also have different numbers of server calls by design. Tests judge authorization and convergence; timing is an exploratory diagnostic only.

## Gates and release state

- The script is executed only by the existing `WORLD_V2_B10_ISOLATED=yes`, localhost-only, fixed-PGDATABASE, no-external-DB-override shell runner, after all earlier R18-30 SQL+wire tests.
- Node source contract rejects changed order/scope, missing rollback, extra overlays, and direct permission grants.
- Run exact-head Node/Vite/audit, CodeQL, independent PG17 authority and combined PG17 tests; report actual results, not predicted passes.
- Any SQL assertion or combined CI failure blocks stage acceptance and must be repaired **without touching live Supabase**.
- R05 and post-R05 SQL release still require authenticated pinned CLI migration history/body reconciliation, separately approved versioned rollout, and independent DM/P1/passive-P2 LOS/fog/observer/position convergence. No single-DM trace can certify private observer revocation.

**Decision:** test-only staged performance evidence; **production server + frontend deployment NO-GO**. Do not merge this cumulative PR diff into main. Compare exact R18-30 parent `4857a2edf1b45dce2089303efc13278a83e6a112` with R18-33 HEAD when reviewing this increment.
