# Tabletop Forge B10-R18-41 — Authority protocol gate after R18-40 live preview failure

**13 November 2026, Australia/Melbourne.** Staged analysis and deterministic regression tests only. No live deployment, SQL, migration, access-control modification, new secrets, Vercel flag or free-tier upgrade.

## Release state

- **Accepted production:** R18-35 SHA `5ca8c83bdef4a5d9870020b0f2b16723f7790e38`, Vercel `dpl_GtaJ4PoxHzXDpN7L46nka8Kqb8mN`. This is the explicit rollback fallback.
- **R18-39:** `99798032abd2a68d6fea32475a4b16a604d2080d`, source of real-browser QA metrics and the **parent of this stage**.
- **R18-40:** `1b33da9bb60252e7964700e9d97b1d05ea452392`, separate draft PR #144, preview-only; **failed** the user-facing wall and rapid movement responsiveness gate. It is deliberately **NOT inherited** by this source branch. R18-40 did preserve a narrow delayed lateral turn, but did not reduce round-trip count.
- **Database:** read-only check on the test Supabase project shows 83 applied migrations; staged B10-R05 `20261111023204` remains unapplied. The associated staged R18-17/19/20/26/27/28/30 SQL candidates and experimental atomic finalizer are **not live**.

## What the DM actually measured

The sole DM attached two genuine V2 QA reports from different sessions. Both identify case A03, DM self-selected, and explicitly mark multiplayer authorization and canonical convergence **unverified**; they are observational measurements, not secure-P1/P2 certification.

| Metric | R18-39 samples / p50 / p95 (ms) | R18-40 samples / p50 / p95 (ms) |
|---|---|---|
| Native pointer event processing | 90 / 0.2 / 0.3 | 215 / 0.1 / 0.2 |
| Prediction check | 162 / 0.1 / 0.2 | 256 / 0 / 0.2 |
| Begin HTTPS RPC | 9 / 192.4 / 343.2 | 9 / 202.6 / 229.2 |
| Advance HTTPS RPC | 24 / 238.3 / 431.8 | 44 / 237.1 / 443 |
| Commit HTTPS RPC | 7 / 1075.1 / 1857 | 7 / 1117.6 / 1308.2 |
| Pointer release to terminal state | 8 / 1164.2 / 2218.1 | 8 / 1173 / 1703.5 |
| Visibility refresh | 7 / 213.8 / 262 | 7 / 240.7 / 262.7 |

R18-40: 812 raw pointer samples across 215 native events; 160 multi-sample events; 597 skipped intermediate prediction checks; 44 Advances, including 6 blocked, and 7 measured Commit RPCs. The renderer's instrumented draw function p95 was 0.1ms, **not complete browser compositor profiling**.

**Direct timeline evidence:** one held-key session from t=30.484 to 37.140 seconds emitted *23* successive `movement.approved keyboard` events, each only after its previous server response, spaced frequently ~200–450ms. The user reports continuing lag on walls, rapid drag and held arrows. A released drag at 11.892s received a `busy` new pointerdown at 13.283s; the first Commit completed only at 13.596s (1.704s release lockout). Another at 14.872s received `busy` 15.876s and committed 16.094s. These are actual same-trace intervals; the percentile comparison across the two captures is not randomized or matched and is **not** causal evidence of improved performance.

**Latest live Postgres read-only snapshot:** `pg_stat_statements`, accumulated since its own reset, shows 1,756 `Advance` calls mean database execution ~64.14ms/max ~2256ms and 514 `Commit` calls mean ~292.46ms/max ~3674ms. These historical DB-execution values must **NOT be subtracted** from unmatched browser timings to claim a measured network component. `track_functions=none` means SQL function/trigger runtime decomposition is not instrumented. No SQL profiling changes made.

## Source-real fault model

1. `src/engine/v2/MovementController.js` calls a serial `authority.begin` → one or more `authority.advance` → `authority.commit` → post-commit signed visibility, with at most one Advance in flight. During a paced held arrow gesture, each key can launch its own new HTTP RPC, and no client-only smoothing can make the *server-approved* position arrive sooner. The new R18-41 deterministic tests prove 23 **paced** key steps need 23 distinct serialized Advances while 23 identical cells **already buffered before Begin** fit into one existing 24-cell packet; the protocol has batching *capacity* but cannot invent future keypress intent.
2. `MovementController.endGesture` keeps the gesture active until a canonical Commit ACK. Accepting a new independent gesture before it resolves would risk a stale origin, overlapping server writes, and unauthorized fog/observer state. This cannot be fixed by simply resetting `controller.active` or hiding `busy`.
3. Live `forge_world_v2.advance_core_v2` handles authenticated, actor-owned serial batches with max 8 targets/24 cells, 64 batches/128 attempted cells, 60s absolute/10s idle session validity, full selection/collision checks for each accepted cell. Client-side speculative visual approval is NOT a substitute for that server verification.
4. Live `public.commit_world_motion_v2` is a canonical write. It locks actor/session/selected pieces; rechecks scene/map/rules/generation, replays the full approved path through `step_allowed`, writes token/tool positions with original row triggers and checkpoint protection, then closes the session. Private signed sight is separately refreshed.
5. R18-38/39 coalescing demonstrably removed most synchronous per-sample collision checks, but that calculation is now ~0.2ms p95 versus ~443ms p95 network Advance. R18-40 rebase may help a particular direction correction; it is **not** a protocol latency solution.
6. Player prediction grants are tied to the current signed frame and original piece position, and permit at most a short authorized fractional displacement. Reusing a stale grant across cells, or giving players the DM's private geometry for prediction, leaks hidden collision/fog and is prohibited.

## Engineering decision: stop visual patching; advance through two isolated backend work packages

### R18-42: source-real server transaction performance gate (no live SQL yet)

- Reconcile the already-staged R05 migration against **exact live 83-version history**, database function hashes and protected rollback SQL. R05 must stay separate from this test-only PR; do not merge it through a cumulative PR. Review unreleased R18-26 (exact wall collision parity), R18-27 (skip genuinely empty Commit work), R18-28/30 (authenticated atomic terminal RPC) as **candidate dependencies**, never as installed functionality.
- Using only disposable PostgreSQL 17 fixtures, profile one-step and multi-step actual `Advance`, wall collision, 2×2 footprint, door/attribute checks, 23 paced Advance versus 23-cell signed single batch, canonical Commit and private observer/sight with source-real functions. Count commits, touched rows, accepted cells, SQL timings, and confirm original vs candidate identical canonical and private results.
- Identify the dominant server work (repeated per-cell attribute queries, wall SAT, token triggers, observer queue drain, lock waits) with *measured* fixture/source-backed evidence. Do not assume a particular optimization's benefit merely because an empty SQL statement appears redundant.
- Do not change a production database function during exploration. The unavoidable client HTTP sequence requires a distinct protocol improvement; SQL micro-optimizations alone cannot guarantee crisp latency.

### R18-43: bounded server-certified movement envelope / aggregated intent design

- Server, not browser, creates a **bounded, time-limited, actor/map/scene/permission/signed-visibility-scoped** set of movement permissions for exactly the subset of cells/edges it can safely disclose to that viewer. No hidden blocker coordinates, undisclosed wall existence, unrestricted DM fog maps, client-generated certification, multi-campaign privileges, or JWT-derived user metadata. A denied/missing grant never authorizes movement.
- Locally paint only inside **currently valid** certified envelope after explicit input. Never move into an uncertified cell or predict through an actual wall; at grant edge, stop and await server. Preserve turns and exact hold/release semantics: no movement beyond actual keypresses. Server continues to validate every submitted crossing before writing canonical state.
- Batch actual observed input without inventing future steps: one bounded authoritative request per coherent input burst (8 targets/24 attempted cells, or less per existing limits). A slow server may coalesce while one request is pending; do not postpone the very first input merely to grow a batch or lose newest turns on blocked ACK. Explicit sequence, expiry, revocation, server-rate caps and deduplicated receipts are mandatory.
- Reduce release lockout by staging a safe, authenticated, **atomic final Advance+Commit** once the R05 dependency chain and R18-28/30 security review pass. Do not start new sessions from speculative, uncommitted endpoints; never ordinary-Commit fallback after uncertain atomic finalization.
- Preserve signed per-recipient V2 Realtime packets, LOS/fog revocations, scene edits, multi-piece collisions and actor IDs. No new polling, unbounded client path buffers, paid database tier, extra project or long-running edge worker.
- Deterministic PG17/Node adversarial tests: player versus DM authorization, unseen wall probing, >1-cell crossing, stale signed grants, scene/permission revocation mid-gesture, forged ACK, delayed packet reorder, real wall/cell corner, held-key release, unchanged canonical observer, failure to finalize, and 64-batch/128-cell resource exhaustion. Include DM + P1 + passive P2 **independent signed live acceptance** before release of any new private motion protocol.

## Release gate

This R18-41 increment is **test/docs only**. Do not change either public domain, Supabase schema, permissions, free-tier capacity or Vercel preview config. PR branch is based directly on R18-39, excluding the R18-40 no-go client experiment. Require exact-head Node test/lint/build/audit/Edge, CodeQL and isolated/combined PG17 checks. These tests establish a **structural baseline**, not a speedup.

**Verdict:** production R18-35 remains the trusted rollback. No further staged code should claim smooth wall collisions or sustained input until new backend and end-to-end evidence exists.
