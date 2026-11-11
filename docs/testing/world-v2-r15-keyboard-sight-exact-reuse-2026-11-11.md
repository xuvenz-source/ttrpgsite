# B10-R15 — Two-player cadence analysis and exact-equivalent keyboard sight reuse

**11 November 2026 — staging only. No release authorization or Supabase migration.**

## Verified baseline and diagnostic result

Production `main@61c53f383b87af2d9d72b83e0cf22dce287b89cc` includes merged R14 PR #99. User-provided paired live traces (R14 instrumentation) show **7/7 committed gestures on the moving actor** and **21 valid private accepted movement frames on the passive observer**, without rejected gestures, invalid frames, renderer seals, unexpected sprite removal, or fog redraw. The latter proves valid receipt for those 21 packet observations; there are no shared packet IDs/timestamps to prove strict one-to-one sender-to-receiver parity. Renderer p95 0.2ms, so the observed mild latency is not explained by passive paint work. Moving actor browser medians: Begin 201ms, Advance 212ms, Commit 199ms; p95 274ms, 325ms and 362ms respectively. Observer frame gap p50 259ms, p95 1,223ms; idle periods between groups can contribute to gap length. Cumulative DB metrics and free-tier memory snapshot from R14 remain contextual, not a causal latency assignment.

The original keyboard stepper in `src/engine/v2/KeyboardStepper.js` awaits `runtime.refreshVisibility('keyboard-continuation')` when new directional inputs are queued during a finishing gesture. Independently, `WorldV2TabletopRuntime.js` already calls `refreshVisibility('committed')` after the same server ACK. R13 instrumentation showed a one-bit queue; in the paired traces two completed keyboard gestures triggered an extra queued request. These exact callsites explain the redundant-work opportunity. Both calls are signed sight RPCs, so wholesale removal would be unsafe.

## R15 implementation (no change to essential authorizations)

- Preserve the existing **mandatory** `committed` signed visibility RPC and **all** scene, permission, epoch, observer, renderer and fog validation.
- Temporarily retain the existing commit request's promise together with the exact ACKed primary-piece endpoint and current environment/permission/scene generations.
- A subsequent `keyboard-continuation` request first awaits that exact in-flight/completed commit request. It is covered **only** if the request succeeded, the runtime remains authorized and the accepted signed roster now shows the same piece at the same canonical endpoint with unchanged generations.
- Otherwise, perform the prior fresh `keyboard-continuation` RPC. This includes a missing ticket, stale signed roster, failed or superseded request, permission/scene change, unavailable piece, map revocation and recovery cases.
- Consume the ticket once; discard it on a new gesture, failed gesture, scene invalidation, permission revocation or disposal. No raw token identifiers or positions are logged; opt-in trace only emits `visibility.continuation=covered|fallback`.
- Non-keyboard visibility triggers, DM preview, fresh independent vision-dirty notices, private movement frames, wall collision and signed fog all retain their previous behavior.

## Automated qualification / release boundary

`tests/world-v2-r15-keyboard-sight-coalescing.test.mjs` exercises:
1. Real movement Begin → Advance → Commit and an overlapping queued keyboard continuation: 2 sight RPCs total (initial + commit) when signed endpoint matches, never an extra queued continuation RPC.
2. Stale signed canonical endpoint: fallback is required (3 sight RPCs total).
3. Permission revocation mid-flight: old sight cannot reinstate authorization, nor launch a new query under revoked scope.
4. An unrelated scene-current refresh still queues normally and is not suppressed.
5. New diagnostic trace labels are fixed and private-data-safe.

**All tests above are staged assertions, not claims of having passed CI.** Qualify at the exact branch head: lint, complete Node tests, npm audit, Vite build, Deno checks, Chromium suite, relevant PostgreSQL/CodeQL security workflows, and concrete PR diff review. Do not merge or deploy until these checks are demonstrated. No new client socket, server process, SQL, timer, subscription, schema, index, RLS rule or paid service is introduced.

## Live-test acceptance (only after CI-qualified, authorized controlled release)

Repeat 30–60 seconds with distinct moving P1 and truly passive P2, capturing `worldV2Trace` after startup. Expected in favorable continuation cases: `visibility.continuation:covered>0`, fewer `visibility.queue:queued` and `visibility.rpc-call:queued`, no increase in `fallback`, rejected gestures, seals, fog redraw, sprite teardown, or RPC tails. Unchanged p95 Advance/Commit may remain ~200–350ms because each server-authorized movement RPC is still sequential. Do not conflate saving one duplicate sight RPC with solving fundamental movement RTT. The R05 comprehensive SQL release remains blocked on migration reconciliation and the 24-case protected QA matrix.

**Handoff:** R15 investigation resolved to exact-equivalent client-side coalescing; target branch `stage/world-v2-b10-r15-keyboard-sight-coalescing-2026-11-11`. No production merge/deploy or live database writes. Next gate: exact-head CI, independent code review, then optional controlled live-test decision.

## Approved R15 controlled live-test script (DM + two players)

**Production release must wait for a successful required `build-and-test` PR status** (a successful duplicate push run cannot override branch protection). Preserve the existing test-only campaign and do not apply R05–R09 SQL.

1. Sign in to separate DM, Player 1 (moving token) and Player 2 (passive observer) browser profiles. Confirm they are all on the same test map, Player 2 has no local gestures, and the DM has a controlled wall/fog test area. Set `worldV2Trace=1` in each signed-in map URL.
2. After map startup finishes, in each developer console run `window.__worldV2Trace.clear()`. Keep both player accounts open for the same approximate 30–60-second movement interval.
3. With Player 1, hold an arrow, then rapidly tap alternating arrows; tap more directions while the preceding commit is in flight; drag several tiles and immediately drag again. Player 2 should not touch controls. Look for no lost gestures, sprite remount, fog-map flashing or newly visible hidden tokens.
4. With the DM, test ordinary drag, arrow keys, player-preview movement, wall blocking and fog-boundary entry. Confirm preview does not mutate live tokens and no player can cross an inaccessible wall or reveal undiscovered private map information.
5. Capture `window.__worldV2Trace.snapshot()` from both Player 1 and Player 2; label accounts and note perceived delays separately. P1: `movement.grabbed/committed/rejected`, `visibility.continuation covered/fallback`, `visibility.rpc-call`, `visibility.queue`, authority p50/p95. P2: `movement.grabbed=0`, `observer.frame-accepted>0`, observer.frame-gap p50/p95; count any invalid frames, seals, fog redraws or sprite removes.
6. Stop and report immediately if authorization errors, map blackouts, repeated rejected gestures, invisible-wall bypasses or hidden NPC leaks occur. Revert the frontend-only R15 commit if post-release security/functional smoke fails; no database rollback is needed.

A successful live test verifies R15's exact-equivalent keyboard visibility optimization, **not** the unshipped R05 server-authority redesign or all 24 protected-fog scenarios.
