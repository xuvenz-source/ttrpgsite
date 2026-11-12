# B10-R18-38 — Coalesced pointer-intent / cosmetic collision preflight reduction (staging-only)

**Date:** 12 November 2026 (Australia/Melbourne). **Reviewed parent:** B10-R18-37 `d2badfe592473c31d23a8f43926ab78eefa0f0c2` (offline tests/docs). **Live source:** R18-35 Git `5ca8c83bdef4a5d9870020b0f2b16723f7790e38`; Vercel `dpl_GtaJ4PoxHzXDpN7L46nka8Kqb8mN`. **Release decision at staging:** do not deploy until tests/security review and separate live-perception gate.

## R18-37 engineering baseline

- Source-real R18-37 test reproduced 240 synchronous `canPredict`/DM geometry checks for 240 fractional samples inside an unchanged cell, with **zero movement RPCs**. This is specific to how client input sampling drives cosmetic prediction, not evidence of 240 server requests.
- Actual `InputController` processes all coalesced `PointerEvent.getCoalescedEvents()` raw samples sequentially. The renderer cannot paint intermediate samples within a single synchronous browser event; only the final sample is perceptible.
- R18-31 retains all ordered in-flight turns, never drops late updates until a blocked ACK; blocked reply intentionally discards unapproved stale route. R18-35 signed zero-motion no-refresh logic is unchanged.
- Cumulative R18-36 immediate ACK snap regression was rolled back and PR #140 closed. **None of its source is reused.**

## Surgical implementation

1. In `MovementController`, extract the **existing** `updateGesture` orchestration to a shared private `updatePointer(pointer,publish=true)`. Every point still passes the exact validated pointer/hysteresis/appendGestureBend/blockedRetry/drain path; **only** `publish=false` skips the cosmetic `sampled` callback and the synchronous local collision/prediction computation. The original public `updateGesture(point)` remains fully synchronous and unchanged in behavior. New `updateGestureSamples(points)` invokes the shared path for every sample in array order, `publish=true` only on its final sample. If an intermediate point is invalid/revoked, it fails closed immediately and never processes later points.
2. In `InputController`, map every native coalesced sample to its existing pointer-offset-adjusted grid coordinate, ignore invalid samples as before, and send multiple samples together to the new controller method. A one-sample event, a pointer release and a test-double/older controller without the method retain the exact original `updateGesture` call behavior.
3. **No requestAnimationFrame, timers, display interpolation, visibility-sight grants, wall geometry, RLS, private observer, authority RPC, permission generation, keyboard stepper, environment, database, migration or dependency change.**
4. Historical source pins remain immutable: `MovementController.js` R18-35 `48070f99f818bc7669f4fc0d6f64335129d6f9cc` remains explicitly recorded, with an audited R18-38 additive controller blob `389105a3b20b97fc66258da65c7adb4c4e5570c9`. `InputController.js` R18-35 `be8f380d70dc188325f791adc4c5bbbc45459db3`; R18-38 `12d3dd6c4fead175e84d7f0139624f896e6dc17f`.

## Behavioral acceptance / explicit limits

- **240-to-1 prediction calls only for a 240-sample coalesced native event**, not a guarantee that 240 separately dispatched `pointermove` events will invoke one callback. In R18-37's direct `updateGesture` test, 240 individual calls should still invoke 240 checks and that test remains unchanged. Do not overstate wall/gesture latency benefits before an actual browser capture with coalescing frequency metrics.
- Preserve **all** mid-event cell crossings, corners and reversals in server Advance targets. Differential tests compare serialized wire request sequences, accepted events and canonical commit endpoints against sequential R18-35 input.
- Only the last fractional sample in the coalesced event may set local cosmetic predicted position. It must independently pass the same original `canPredict` callback and signed/DM collision restrictions. No new prediction authority or hidden-wall reveal.
- A blocked server reply must continue rejecting stale queued path even if newly coalesced. Rapid turns near a blocked wall are a separate root cause to address, not solved here.
- Invalid intermediate samples fail closed; permission revocation during pending Advance prevents late commit; actual pointer-up sample is submitted before endGesture and never replaced by a stale coalesced sample.
- The sequential server Begin/Advance/Commit chain and ~1-second commit path are **not** improved by this client event-coalescing optimization. Client input callback CPU is the targeted improvement.
- Conservatively keep R18-35 on both production aliases until bounded preview and browser benchmark can justify a canary. P1/P2 independent participant fog/LOS acceptance cannot be replaced by these unit tests.

## Release handoff

Run exact-head 978+ Node tests, including prior R18-37 characterization and new R18-38 source-real/differential/adversarial tests; build/lint/npm prod audit/Edge, isolated PG17 authority, combined PG17 suite, CodeQL and strict file comparison. Do not merge any cumulative R05 SQL or apply migration `20261111023204`. Roll back any future attempted live deployment to READY R18-35 immediately if movement/collision feels worse.
