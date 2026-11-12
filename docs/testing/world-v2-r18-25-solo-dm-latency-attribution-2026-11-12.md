# B10-R18-25 — DM corner, collision, note-pin and fast-movement latency attribution

**Date:** 12 November 2026 (Australia/Melbourne)
**Scope:** isolated R18-24 live canary `7326c45d80609c00cea5b9dd0593989dd458dd7a` + CPU-only tracing. Staging source only until CI and separately controlled live frontend test. **No SQL, no releases of R18-16+ collision/security candidates, no main merge, no paid tier.**

## Evidence from DM WorldTrace

The user observed corner drag latency, large stalls on walls and even note pins, and mild fast-movement rubber-banding. Their existing 256-event opt-in trace recorded:

| Metric | Samples | p50 (ms) | p95 (ms) |
| --- | ---: | ---: | ---: |
| Movement Begin RPC | 8 | 195.4 | 287.2 |
| Movement Advance RPC | 49 | 225.5 | 292.1 |
| Movement Commit RPC | 6 | 976.2 | 1020.7 |
| Release to terminal | 8 | 983.4 | 1544.7 |
| Signed visibility refresh RPC | 11 | 207.1 | 1070.2 |
| Tracked renderer frame callback | 256 | 0 | 0.1 |

Other observed counts: 38 movement approvals, 11 blocked steps, 7 commits, 1 blur cancellation, 8 successful picks. Even after release the browser can wait on remaining *sequential* Advance RPCs and then a costly Commit. The frame callback metric measures only the tracked drawing work and **cannot** rule out synchronous pointer processing, local collision preflight, layout, or browser compositing cost.

## Actual source review

- The live `MovementController` drains at most one sequential `authority.advance` at a time and waits for `authority.commit` before releasing a gesture. No safe client-only patch can remove these round trips or authorize an unapproved endpoint.
- The DM `canPredict` path runs `collisionAllowsStep` against the DM-only, published collision cache. The solver checks swept token/tool footprints against indexed wall segments; a wall near a cell corner can deny local fractional presentation and expose network lag.
- `MapPinLayer` renders handout pins as clickable, interactive overlays, **not collision barriers**. `PointerHitTest` deliberately excludes pin buttons from token selection. A pointerdown on a pin can therefore fail to grab a token; a pin alone does not explain a PostgreSQL movement collision. There is no evidence from the provided trace proving pin activation caused the delay.
- The existing private observer/fog and movement authority restrictions must remain unchanged. R18-16+ collision tolerance and R18-17/19/20 database parity candidates are still separately staged and **not** installed.

## New bounded opt-in measurements (R18-25)

Only with `?worldV2Trace=1` and the R18-25 isolated frontend:

1. `input.pick-duration` — synchronous time to select a token (not Auth Begin).
2. `input.pointer-handle` — time to handle an entire pointermove event including its browser-coalesced samples, routing, and local collision prediction.
3. `prediction.local` — synchronous cost of the local collision/grant prediction callback, without revealing whether it saw an undisclosed wall.
4. `input.pointer.intercept` with allowlisted detail `pin` — a pointerdown aimed at a note pin was denied token selection. It does not indicate pin-wall collision.

All timing entries live in the existing 256-entry in-memory, opt-in trace; no new network, Realtime channels, storage, identifiers, coordinates, DOM targets, credentials, or geometry are logged. No authority, fog, collision, pointer behavior, or server function is changed. Existing R18-24 **QA capture → Copy safe report** includes these metrics automatically.

## Real solo DM test on separately deployed R18-25 frontend

One DM can test **input responsiveness and client CPU/commit attribution**, not player fog isolation or multiplayer synchronization.

- Keep the same published map, browser profile, zoom and token for all comparisons.
- With `?worldV2Trace=1`, open QA capture, choose **collision**, Start/reset; do 5 deliberate slow movements beside wall corners and 5 blocked attempts. Copy safe report.
- Select **open** and Start/reset; do 10 fast arrow inputs and 5 open-ground drags with no pin interaction. Copy safe report.
- Select **stress** and Start/reset; do 20–30 seconds of continued movement near note pins, noting whether the pin opens/captures the input. Copy safe report.
- Describe *where* the delay occurred (before token grabbed; during drag; after release; only after collision; after note popup), separately from trace data. **Do not** share token IDs, map URLs with private parameters, hidden coordinates or signed visibility.
- A single large `prediction.local` p95 or `input.pointer-handle` p95 indicates CPU-bound work to investigate. Low local durations combined with 200–300 ms Advance and ~1 s Commit indicate server/network-bound delay. The metrics do not automatically distinguish DB compute from network RTT.
- Do not interpret no recorded `pin` event as proof that a pin had no effect: moving over a pin after a successful grab is different from clicking a pin at gesture start.

## Engineering order / release gates

1. R18-25 CPU attribution deployed only after exact-head 100% CI, CodeQL and isolated PG authority pass. Preserve the original R18-24 Vercel deployment for rollback. Do not merge staged SQL or widen permissions.
2. Analyze the new DM report and decide whether a **local-only prediction optimization** is warranted. Any geometry tolerance change must prove parity with server-side collision before release.
3. Independently profile the existing Commit RPC with safe database diagnostics or isolated PostgreSQL tests; do not switch on new PG extensions or tracing in the constrained live Free-tier database solely to chase latency. Avoid writing production SQL without authenticated migration and security gates.
4. Real signed DM/Player1/passive Player2 fog, private Realtime, endpoint convergence and revocation testing remain mandatory before integrated SQL authorizations.

**NO-GO for combined movement/security SQL.** This step deliberately distinguishes root causes instead of making a speculative collision/security patch.
