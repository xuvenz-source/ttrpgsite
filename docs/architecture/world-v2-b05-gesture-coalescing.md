# B05 — Bounded ordered-gesture coalescing (staged frontend only)

**Status:** STAGED — feature off by default, **not deployed**.  
**Recorded:** 11 November 2026 (Melbourne).  
**Production baseline:** `main@b246b3a72537b53b2afc2a9a38cbe1db3609a8af`; staged parent B04 PR #79 head `53f20ce5bb779092db7c654057270b93e6a8a0e4`.  
**Authorization:** The designer explicitly directed "Proceed with B05", permitting this **B05-only staging** exception while A06/Gate A remains blocked. This does **not** authorize merge, live SQL/Edge changes, production deployment, enabling the build flag, B06, or treating CI as live multiplayer acceptance.

## 1. Root cause targeted and compatibility

The deployed `MovementController.drain()` already has a single in-flight `advance` and uses `takeGestureBatch` (8 waypoint targets, 24 expanded cells). B05 is **not** a new authority service or a claim that batching was absent.

The original controller takes a snapshot of `g.pending`, awaits server ACK, then runs `g.pending.splice(0,batch.consumed)` against the **live mutated array**. During the `await`, fresh pointer/arrow input can change or collapse entries in that array. The consumed count is from the old snapshot; applying it to the newly mutated queue can discard turns or cause an unapproved shortcut. B05 fixes that state-inconsistency only on an experimental code path; **legacy/default semantics are left in place until opt-in qualification**.

## 2. Implemented boundary and flow

Files:
- `src/engine/v2/MovementController.js` — opt-in detached immutable in-flight request, ordered pending path with `queueFrom`, a short flush window, optional deadline guard and late-begin retirement.
- `src/engine/v2/WorldV2TabletopRuntime.js` — disabled-by-default Vite build flag `VITE_WORLD_V2_COALESCE_MOTION=1`; otherwise the exact previous controller branch remains active, with no config, SQL or server changes.
- `tests/world-v2-b05-ordered-coalescing-2026-11-11.test.mjs` — 13 deterministic model/controller tests.
- This document and the two persistent release-state ledgers.

**Feature flag:** The new queue branch is enabled only if the bundler explicitly sets `VITE_WORLD_V2_COALESCE_MOTION=1` when building a future authorized *QA* artifact. **No live Vercel environment variable was changed**, and there is no automatic client flag, query parameter or service role capability. Disabled means current `updateGesture` scheduling, pending-array reconciliation and server RPC transport remain the pre-B05 behavior. Both branches share the existing B01/B02 authority contract and WorldV2 V2 server.

### B05 new gesture state

```text
input samples (pointer/touch/keyboard)
    ↓ appendGestureBend (forward collinear compression ONLY; keep turns/reversal)
pending[] anchored to queueFrom  [bounded 128 bends]
    ↓ 16ms first-sample debounce, or immediate on release / DM preview
takeGestureBatch (≤8 targets / ≤24 swept cells)
    ↓ synchronous detach: pending = remaining; queueFrom = sent last target
one in-flight authenticated V2 advance RPC, sequence n+1
    ↓ await ACK with local 8000ms hard deadline
validAck (exact accepted contiguous prefix, session and sequence)
    ├─ valid, not blocked: approved = ACK endpoint; next detached pending batch
    ├─ blocked: clear all pending unapproved route; queueFrom = approved frontier
    ├─ timeout / invalid ACK / permission change: reject/cancel and conceal
    └─ release: drain all safe accepted path before one atomic final V2 commit
```

- Input arrives while an advance is pending: the new queue starts at the *already-issued* batch's target. New turns **cannot be spliced away** by a late ACK. No endpoint-only shortcut is legal.
- On blocked prefix: server-approved cells are the only canonical reference; all newer unapproved samples are dropped. Fresh input can retry from the currently authorized frontier. Hidden blocker geometry remains server-only.
- Default `canPredict` is **false**. B05 adds no grant, map geometry, token visibility, Realtime or prediction bypass; B06 handles certified presentation separately.
- **One advance in flight per gesture**; no parallel sequence, speculative path, uncontrolled retry, or new API. `AuthorityClient` remains unchanged; the final V2 commit is still serialized after accepted advances. Preview retains its local-only `commit` prohibition.
- The new 16ms first-sample input debounce is meant to coalesce pointer samples within a refresh interval; it is **not measured tuning**. Immediate release drains at once; local DM preview bypasses that delay. B07 must separately enforce recipient-aware Realtime emission limits; B05 alone **does not cap server broadcast at 5Hz**.
- The B05 local network deadline defaults to **8000ms** (constructor accepts 1000–9000ms, tests use manually fired timers). A timeout rejects the local gesture and attempts server cancellation without awaiting it; late ACKs are ignored. A session returned after begin timeout is separately retired. In-flight HTTP cannot be forcibly killed by this frontend wrapper, and the server's pre-existing session expiry still protects authority state.
- Failed/unknown commit ACKs must be reconciled via fresh authorized state, never retried as an invented second commit in this step. The preexisting renderer receives rejected/committed events as before.

## 3. Tests and evidence

On the exact **initial B05 implementation-and-tests head** `927d71a3bc46acb4418c6e7d882ab926e05a1a38`, [GitHub CI run #42826832604](https://github.com/xuvenz-source/ttrpgsite/actions/runs/42826832604) passed **790/790 tests**, zero high-severity production dependency vulnerabilities, Vite production build, critical JS lint and Edge Function Deno typechecks. An exact final PR-head CI recheck is required after recording the release ledger/PR identity.

B05's 13 deterministic tests exercise:
1. 5 rapid collinear pointer samples reduced to 1 approved advance and one final commit.
2. New turns/reversal after a request has already started, including immutable in-flight batches and ordered successive server sequence.
3. 70-cell gesture split across 24/24/22-cell advances without losing the newest target.
4. Partial blocking drops unapproved turns, yet commits exactly the accepted legal prefix.
5. Blocked-first-cell never commits a moved endpoint.
6. Begin timeout rejects immediately and separately cancels a late-returned session.
7. Advance timeout rejects and ignores a subsequent stale ACK.
8. Commit timeout never issues a duplicate final commit.
9. Cancellation followed by a new gesture does not receive old approval.
10. Forged/non-prefix server ACK is rejected, never committed.
11. DM preview uses the same ordered route with no persistent commit.
12. No feature flag means the old immediate path and no coalescing timer.
13. Lack of certified `canPredict` means no speculative movement.

**Test type:** deterministic NodeJS mocked authority and timer tests + full staged CI; **not** browser/real JWT/real network, CI load test, 3 authenticated DM/P1/P2, fog, wall stress, p95 measurements or production acceptance. The B04 isolated PostgreSQL suite continues to validate the unchanged B03 candidate independently. This B05 PR adds **no migration**.

## 4. Outstanding blockers / decisions

- A06 remains **BLOCKED**, Gate A **NOT PASSED**. A05 telemetry and real protected DM/P1/P2 browser instrumentation not yet deployed/run.
- B04 finding **H39** remains unresolved: existing public `advance_core_v2` returns prior ACK for altered same-sequence replay. The staged frontend does not fix a server authority contract violation; B08/security review must harden request-bound idempotency.
- PR #71 remains independently amend-before-merge (bounded observer recovery deadline, input lock, scoped sight and QA).
- B03 candidate private SQL must not be applied directly or wired into the active public RPC until the integrated release sequence; B05 uses the **current** unchanged RPC.
- Only the isolated tests prove order/cancellation *logic*, not real RTT. The current historical SQL means are not an end-to-end p95 improvement estimate. The new flag is **NOT enabled** and no user-visible performance change has occurred.
- A bounded client-side timer is not a server cancellation or hard socket abort; if a commit times out, the client must fetch a fresh canonical authorized state rather than force a position locally.

**Next numbered step:** **B06 — local certified motion presentation**, separately gated. B05 staged passes targeted checks; full Gate B/B10 and release approval remain outstanding.
