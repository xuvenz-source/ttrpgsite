# B10-R09 — Source-traced startup interruption and first guarded candidate

**11 November 2026. Stage only; NO-GO to release.** Parent PR #93 head `49f3e6cd4a5980d3a936c0047e501ba26661e133`. No production merge, Vercel build activation, SQL/migration, backend grant, campaign edit or paid infra.

## Verified browser trace, PR70
The designer's bounded opt-in live trace reports six successful token picks/grabs. Initial authorized sprites paint at ~820ms; private `SUBSCRIBED` resync at 1240ms seals renderer, removes six sprites and makes it opaque. Another scene-current seal occurs at 1637ms; six sprites return at 1855ms. **This is a verified initial startup flash**, not proof of in-motion terrain reassignment. Only one terrain-assign is shown and it is at initial startup; no later terrain assignment in this capture.

Measured browser RPC p95 for small samples: Begin 726.9ms (6), Advance 294ms (11), Commit 308.7ms (3), visibility 788.9ms (9); renderer work 0.1ms (96). These are not long-term p95, cannot establish causal contribution of DB time vs RTT, and cannot determine Player2's in-motion blackout. Keyboard gestures were rejected twice after preceding movements, but old trace did not expose rejection reason.

## R09 isolated candidate
The present runtime fetches signed sight, paints six sprites, **then** subscribes to the private observer, whose required security seal destroys them. Stage `VITE_WORLD_V2_OBSERVER_FIRST_BOOTSTRAP=1` (default OFF) to reverse only *first-paint* order for normal DM/player: load scene, create locked private channel, permit first signed visibility/roster only when `SUBSCRIBED` invokes actor-bound `vision.observerSnapshot()`. `scene-current` cannot prepaint before subscription. No browser authority or synthesized cursor, no public fallback; a failed subscription leaves the view locked. Disconnect and permission change must still revoke sight immediately. DM player-preview has no private player channel and stays on its prior signed preview bootstrap.

**Important:** This fixes the verified *initial* blank/recreate, not the dominant 200–700ms request latencies. B05/B06/B08 and R02 polling remain OFF; R05 migration remains uninstalled. A04 protected 24-case real DM/P1/P2 testing remains NOT RUN.

Future opt-in trace adds enumerated `movement.reject-reason` details; unknown server exceptions are mapped to `other`, no arbitrary data, ids, coordinates, JWTs, payloads or logs.

## Gates and handoff
New browser-representative harness assertions require no first sight before subscription, exactly one signed adoption after subscription, no later scene-current seal, and fail-closed disconnect. Preview is verified separately. Full Node/Vite, PG17, CodeQL and independent real authenticated fog/hidden NPC QA are required before enabling this flag live.

**R09:** staged; **release:** NO-GO; **next:** B10-R10 — secure client-only canary evaluation and additional Player1/Player2 trace for movement flashes/reject causes. No database application or production deployment until gates pass.

### R09 CI follow-up: close the two-subscription race
An initial test run discovered that scene subscription itself invalidates scene authority, independently of the private observer seal. The release candidate now holds the first sight until **both** channels are ready. The harness tests scene-first, observer-first, no-scene fail-closed, preview isolation and explicit disconnect revocation. The R08 historical next-step assertion was made immutable instead of a brittle global next-pointer. This amendment remains staged with no live deployment.
