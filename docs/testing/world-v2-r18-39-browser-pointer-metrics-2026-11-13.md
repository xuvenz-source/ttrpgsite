# B10-R18-39 — Opt-in real-browser input/geometry timing diagnostics

**Date:** 13 November 2026 (Australia/Melbourne).

**Source:** known R18-35 live Git `5ca8c83bdef4a5d9870020b0f2b16723f7790e38` → R18-37 root-cause tests/docs `d2badfe592473c31d23a8f43926ab78eefa0f0c2` → R18-38 coalesced pointer processing `4eb2e93067514425292d1eae2cafb69e73de0f6c` → this R18-39 standalone opt-in diagnostic increment. R18-36 regression remains rejected and is *not* included.

## Why this package exists

R18-38 showed, in synthetic frontend tests, that 240 coalesced raw pointer samples could retain all cell/turn intent while calling expensive local `canPredict` only once. That does **not** establish how often real browsers coalesce movement events or how large this callback's actual cost is.

R18-35/R18-36 user reports already show much longer server-side Begin/Advance/Commit chains (approval p50 220–245 ms, commit p50 ~1,000 ms). The R18-38 improvement is purely cosmetic client CPU; we cannot claim that it resolves wall response delays, long sessions, fog revocation or rubberbanding without browser data.

The duplicate PR push/PR frontend CI on R18-38 did not both pass: *push at same commit passed 988 tests/build/audit/Edge*; PR verification remained in progress for ~20 minutes and was cancelled. CodeQL and both PostgreSQL suites passed. A cancelled parallel run is **not** a successful gate.

## Precisely what is recorded

`WorldTrace` retains the original no-storage, no-network, opt-in `?worldV2Trace=1` recorder, `limit` 16..512, and strict allowlist. R18-39 adds **aggregate counters** only, never entries in the 256-event timeline:

- `input.pointer.move-events`: native document-capture pointermove events handled during a held gesture
- `input.pointer.samples`: mapped event samples processed
- `input.pointer.batches`: events containing more than one sample
- `input.pointer.batched-samples`: samples in multi-sample events
- `input.pointer.single-events`: events with one sample
- `movement.prediction-checked`: actually performed costly local/signed prediction check
- `movement.prediction-skipped`: intermediate samples retained in ordered intent queue without an unpaintable cosmetic prediction evaluation

Two bounded **duration metrics**, populated only when opt-in QA is enabled: `input.pointer.processing` (per native move callback synchronous wall time including JavaScript processing) and `movement.prediction-check` (per actually called `canPredict` synchronous elapsed time). Like existing metrics, each has at most 256 rolling per-event samples and reports p50/p95/max in ms. This measures **local client time**, not server round-trip latency and not full browser frame rendering.

**No token/user/account/session IDs, coordinates, geometry, RPC payloads, signed sight, map name, URL, error text or raw PointerEvent are retained.** Counters are finite bounded integers; new duration names and report-count keys are strict allowlists. QA export only copies locally on explicit user action; no network or browser storage. Disabled by default; a test verifies no counters or durations are emitted without opt-in.

`InputController` accepts an optional injected trace for deterministic testing; in production the existing singleton is unchanged. `MovementController` records one check per actual invocation and one skipped per valid intermediate sample. The R18-38 path/authorization code is otherwise unchanged.

## Benchmark/release protocol

1. **No P1/P2 accounts needed** for this performance characterization. The sole DM can run the test after a preview deployment is READY and an accessible preview authentication context is verified.
2. Compare against R18-35 using the same live test map, same browser/device, same DM and short sessions:
   - Unobstructed fast mouse drag for 10–15 seconds, then copy QA report with case `open`.
   - Several wall/corner approaches and sideways changes while still dragging, then copy QA report with case `collision`.
   - Arrow-key sustained movement for 10–15 seconds, copy QA report with case `stress`.
   - Repeat the wall test near a note marker; confirm no hidden geometry revealed and exact authoritative collision.
3. Interpret `input.pointer.batches / input.pointer.move-events` as real browser coalescing rate; `input.pointer.batched-samples / input.pointer.samples` as raw samples eligible for R18-38 batching. Compare counts `movement.prediction-checked` and `movement.prediction-skipped`, `movement.prediction-check` p95, and `authority.advance`/`authority.commit` p95. The latter are still separately measured client-side RPC calls.
4. **Go/no-go**: If native multi-sample events are rare, R18-38 cannot materially help most input. If collision lag remains dominated by authority delays or blocked intent loss, prioritize session/protocol work rather than more visual interpolation. Do not ship R18-39 to production solely because its diagnostic counters work.
5. A staging preview of exactly reviewed head SHA is eligible *after* passing CI (Node tests/lint/Vite/Edge/audit, isolated PG17, combined PG17, CodeQL). Preview must not be aliased to production. If preview auth is protected/unavailable, stop and request no production migration or free-plan upgrade.
6. No database, SQL, migrations, RLS, observer, fog, server RPC, auth or dependency changes. R05 migration `20261111023204` remains unreleased. P1/P2 fog security tests are still a future independent release gate.

## Known limitations

- The new `movement.prediction-skipped` is **not equivalent to server-approved movement** or collision success. It records saved cosmetic checks, not saved RPCs.
- The timing samples incur opt-in QA overhead and capture only synchronous JS execution. They are not a Chromium browser-frame profiler, GPU measurement or evidence of a network optimization.
- MovementController's `sampled` event behavior within coalesced input is from the previously reviewed R18-38 change and has not been further altered here.
- The renderer `render.frame` timer still covers only its instrumented draw function, not style/layout/compositor work.
- Input coordinates can be coalesced unevenly by browser/device and delivered only as singletons. Real QA is required.

**Current live baseline remains R18-35. This package is isolated, draft/unmerged and not a production deploy.**
