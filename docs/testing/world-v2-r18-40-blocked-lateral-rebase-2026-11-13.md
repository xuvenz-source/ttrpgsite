# B10-R18-40 — ACK-safe lateral intent rebase after a blocked wall advance

Date: 13 November 2026 Australia/Melbourne. **Parent:** R18-39 `99798032abd2a68d6fea32475a4b16a604d2080d`, preview-only, V2 activation flags now branch-scoped to R18-39 preview. **Live baseline:** R18-35 `5ca8c83bdef4a5d9870020b0f2b16723f7790e38`. No changes in production.

## Trigger / measured evidence

The sole DM's authenticated R18-39 V2 opt-in QA capture (case A03; self-selected role DM) showed:

| Metric | Samples | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|---:|
| input.pointer.processing | 90 | 0.2 | **0.3** | 1.0 |
| movement.prediction-check | 162 | 0.1 | **0.2** | 0.7 |
| authority.begin | 9 | 192.4 | **343.2** | 343.2 |
| authority.advance | 24 | 238.3 | **431.8** | 592.6 |
| authority.commit | 7 | 1075.1 | **1857.0** | 1857.0 |
| movement.release-to-terminal | 8 | 1164.2 | **2218.1** | 2218.1 |
| visibility.rpc | 7 | 213.8 | **262.0** | 262.0 |

Real pointer events: 90 move events, 590 total samples, 75 multi-sample events/575 batched samples, 500 skipped intermediate checks. This shows R18-38's coalescing is active but local CPU cost is now negligible relative to authority RPCs. 5 blocked ACKs; 8 commits/9 grabs (last gesture still active at capture). This trace **does not prove** that player sprites crossed a wall, since the QA report intentionally contains no coordinates/geometry or signed grants. It is not a two-player fog security test.

One direct lockout: pointer released at elapsed 59,468 ms, subsequent pointerdown at 60,340 ms got `busy`, previous gesture committed at 61,248 ms. Thus quick regrab was rejected during **1.78 seconds release→commit**. Do not advertise a fix for that with R18-40.

R18-37 documented that a blocked Advance ACK clears all `g.pending` input, including independent new sideways intent that arrived during the 200–500 ms wait. It is a correctness/latency defect in pointer intent, even if collision is server-enforced.

## Narrow source change

Only `src/engine/v2/MovementController.js` (plus tests/docs):

1. Each accepted *changed-grid-cell pointer intent* increments a monotonic per-gesture `inputRevision`. Same-cell micro-movements (even hundreds of samples) do not.
2. Immediately before each serialized `authority.advance`, record `inputRevisionAtSend`. This distinguishes genuinely **new input after the RPC started** from an old unsent tail of a budget-truncated 24-cell batch.
3. After **exact valid ACK** of blocked route: retain canonical accepted prefix, clear all unapproved bends and reset cosmetic prediction to the server-approved position, as before.
4. If pointer/touch/DM-preview has **newer changed-cell input during that precise network wait**, examine only its latest quantized target. Expand the route from the **ACKed approved** position. A safe rebase is eligible only if its first step differs from the **first denied cell**. Straight extension through that same denied crossing is discarded. For a qualifying changed direction, append **one** fresh destination to the queue and let the **unchanged serial server Advance API revalidate** it. Never synthesize approval, grant, sight, RPC ACK, wall geometry or client position. No rebase for keyboard.
5. If server denies the fresh reroute as well, no further automatic replay occurs without another actual changed-cell input. Release may still wait for in-flight RPC(s) and a Commit; this package does **not** solve the release lockout.

## Security and performance bounds

- No new database function, migration, SQL, auth/permission changes, RLS change, visibility grant, observer path or hidden-wall disclosure. The second route uses normal per-user per-map authority plus existing server rate/batch/path limit.
- The exact denied crossing is only used locally to suppress retry of the same blocked wall; it is never surfaced to a player or reported in the privacy-safe QA trace.
- `expandGestureRoute` is bounded to 512 attempted cells for this local **comparison only**; `takeGestureBatch` still caps each Advance to 24 cells/8 targets. The request can never skip intermediate collision validation.
- Revision guard prevents replay of preexisting unsent bends from partial batches (important anti-probing and correctness). Permission/context revocation or malformed ACK still wins; no movement commit.
- Fail-closed alternative for unknown/private collision: do not cosmetically predict a new cell merely because an alternate bend exists.
- Functional improvement expected only for a wall collision followed by a genuine sideways movement while the previous RPC is unresolved. **Do not claim improved Commit latency, instantaneous next drag, 10% wall cell coverage rule, spectator fog, or broad live success.**

## Release gate / handoff

- Test exact SHA against R18-39 parent; run Node tests/lint/npm production audit/Vite build/Edge function checks, isolated PG17, integrated PG17, CodeQL. Browser QA requires a build with V2 flags, not the unconfigured legacy preview.
- Regression tests require: true server block, fresh lateral rebase, final endpoint only after valid ACK, partial-accepted prefix, straight same-wall no-loop, duplicate denied target suppression, chained block fail closed, keyboard unchanged, malformed ACK reject, permission revocation, old partial-batch remainder discarded and same-cell noise not marking an old tail fresh.
- Draft staging only. No merge or production deployment until CI passes and a separate DM-only V2 preview confirms wall/corner responsiveness without wall penetration.
- For fast regrab and 1.1–1.9s Commit, separately assess authority architecture. Never bypass the server's canonical commit or carry a session's signed grant across permission/fog changes.

## QA

Use `?worldV2Trace=1` and the bottom-right **QA capture** button (not the Developer Tools `copy()` helper). Reset before each wall/corner/quick-regrab scenario. Role/case are self-selected, not multi-account verification. Capture only allowlisted redacted report; describe subjective movement separately.
