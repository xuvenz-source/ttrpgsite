# B10-R18-37 — Movement authority latency and sustained-gesture root-cause characterization

Date: 12 November 2026 (Australia/Melbourne). **Source baseline:** R18-35 accepted live Git `5ca8c83bdef4a5d9870020b0f2b16723f7790e38`; deployment `dpl_GtaJ4PoxHzXDpN7L46nka8Kqb8mN`. R18-36 was formally rejected, removed from both aliases, and draft PR #140 was closed without merging. **No live deployment or database change in R18-37.**

## Source-backed findings

1. **Serial authority is structurally coupled to each gesture.** The active controller `MovementController.js` waits for `authority.begin` before draining `authority.advance`, then awaits each single in-flight Advance before allowing the next batch; on release it waits for the remaining queue, then a separate `authority.commit`. `WorldV2TabletopRuntime.js` separately requests signed post-commit sight. `R18-31` correctly retains mouse events queued during an in-flight Advance but cannot reduce these round trips. Its source stays untouched here.
2. **Every pointer sample enters a synchronous prediction/collision check.** `InputController.js` forwards *every* `getCoalescedEvents()` sample; `MovementController.updateGesture` invokes `canPredict` even if its quantized pointer-intent cell did not change. The DM's `canPredict` calls the local `collisionAllowsStep` geometry solver. A benchmarked code-level test documents **240 collision/prediction callbacks for 240 sub-cell moves with 0 actual cell changes**. This is redundant computation, not 240 server RPCs. No client fix has been authorized yet; do not naively drop coalesced corners, break hysteresis, cache unsafe collision permissions or replay stale grants.
3. **A blocked Advance currently deletes input queued during the network wait.** In `MovementController.drain`, after a `blocked` ACK, `g.pending.length=0` drops all unapproved queued motion. This is fail-closed and avoids walking through a hidden wall, but it also means a new sideways turn made while the 200-500ms response is pending can disappear; a deterministic regression fixture reproduces exactly this behavior. A safe future solution must preserve newly issued independent intent only after rebasing it on the signed approved endpoint, without replaying the denied segment, and must distinguish incoming pointer intent generation. R18-32's old retry suppression regressed live performance and remains prohibited.
4. **Viewer prediction intentionally stops after the signed starting cell.** `PredictionGrants.canPredictWithinWorldGrants` requires the actor's current `request.from` to equal its position in the original signed snapshot. After the first approved cell, the viewer cannot predict another fraction using that stale grant until fresh sight is admitted. This preserves fog/LOS privacy, but explains some prolonged authority-dependent presentation. DM collision preflight has full DM geometry; do not expose it to viewers.
5. **Existing Postgres sessions are bounded.** Read-only inspection of live `forge_world_v2.advance_core_v2` confirms `s.batches>=64`, `s.attempted_cells>=128` and at most 24 attempted cells per batch. Session validity expires after 10s inactivity and 60s absolute lifetime. These guards return NULL on failure; current `AuthorityClient` classifies NULL as `Invalid world movement response`. The earlier isolated DM trace's long-keyboard invalid reply is **consistent** with a budget or expiry, but it is not attributable without server-side per-gesture telemetry. Read-only *current* motion-session aggregate was only 1 archived session (max 9 batches/21 attempted cells), not a snapshot of that test.
6. **Commit work is nontrivial even before network.** Live `commit_world_motion_v2` revalidates all prior accepted steps and locks/updates token or tool rows; `advance_world_motion_v2` publishes private observer motion and signals sight per accepted Advance. No broad bypass is safe.

## Observations and limitations

From the rejected R18-36 solo-DM trace: `authority.advance` p50 **245ms** / p95 **520.7ms** (59 samples); `authority.commit` p50 **1020.6ms** / p95 **1148.6ms** (8 samples); `movement.release-to-terminal` p50 **1074.1ms** / p95 **2952.8ms** (9 samples). The prior R18-35 solo trace recorded Advance p50 **220.1ms** / p95 **321.6ms** and Commit p50 **1008.2ms** / p95 **1070.6ms**, but the two traces are *not* matched, randomized performance experiments. The user conclusively reported R18-36 felt worse; we rolled it back.

Read-only `pg_stat_statements` aggregate since its own last reset (different measurement window) shows:
- Advance: **1685 calls**, mean database execution **62.3ms**, observed max **2256.4ms**
- Begin: **585 calls**, mean **25.7ms**, max **743.6ms**
- Commit: **492 calls**, mean **259.7ms**, max **3673.7ms**
- Cancel: **64 calls**, mean **123.7ms**, max **2373.2ms**

These values are **database-execution statistics**, not client end-to-end latencies; pooled across multiple test runs and not comparable by percentile. They do not establish which single factor (network RTT, Postgres lock/replay work, serialization, client processing or free-tier load) dominates an individual slow gesture. `track_functions=none`, so per-function timing decomposition is not available without changing server configuration; we have not done that.

## New non-production tests

`tests/world-v2-r18-37-authority-queue-characterization.test.mjs` provides deterministic regression evidence for:
- one Advance at a time despite new bends arriving during its server wait; second Advance before commit
- 240 unchanged-cell pointer samples causing 240 prediction checks, without creating any RPC
- server-blocked ACK discarding unapproved lateral turn queued in-flight (document existing fail-closed semantics)
- valid signed viewer prediction at origin, denied when signed origin becomes stale, admitted again only after new signed sight
- 64 successful simulated batches followed by explicit NULL-like `Invalid world movement response` rejection, *illustrating the client reaction* to a hard session cap, not reproducing an actual production rejection
- immutable shipped migration text includes 64-batch/128-attempt/60s/10s guards

This step modifies NO production JavaScript or SQL. The tests intentionally characterize current undesirable behavior; they are not assertions that the long-term design should retain it.

## Engineering decision and next isolated work

**R18-37: evidence/staging only, NO LIVE DEPLOY.** R18-35 remains live. The previous R18-36 cosmetic snap code and high-frequency trace instrumentation are excluded.

Plan a single constrained **R18-38** client-intent reduction experiment with executable path-fidelity tests, *not* a blindly deployed frame throttle:
- Reduce redundant same-cell prediction checks and carefully coalesce coalesced pointer samples while retaining actual deliberate corners, reversals, boundary hysteresis, newest pointer-up intent, and existing 8-target/24-cell batch bounds.
- Never cache a positive collision prediction when its fractional pointer endpoint, scene, permission generation, signed grant or approved origin changed.
- Preserve full server validation and a single in-flight Advance. Bench with identical delayed-ACK scenarios versus R18-35 and report CPU/predict callbacks, pending bends, Advance request count, approved-path parity and blocked response behavior.
- Consider safe rebase of *new* sideways intent on block separately; do not reuse R18-32 rejected logic.
- A distinct future server-authority work package must address session limits, long-gesture rollover security and the ~1s Commit. Do not silently increase server budgets, manufacture signed sight, merge unreleased R05 SQL or bypass per-user anti-probing protections.

**Release gates for any subsequent live change:** source parity against R18-35, full Node/lint/audit/Vite/Edge and PG17 tests, CodeQL, proof that no unauthorized sight/positions appear, exact SHA preview, and retain R18-35 rollback. Independent DM/P1/P2 sight/fog/revocation acceptance remains required before any server changes.
