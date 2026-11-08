# Step 1 — navigation-grant performance and refresh-frequency correction
Date: 2026-11-09
Branch: `stage/complete-predictive-navigation-and-fog-2026-11-09`
Release: **STAGING ONLY — do not merge, deploy, or apply production SQL.**

## Verified source-level causes
1. The pre-existing navigation SQL iterated a maximum 25×25 cell window and evaluated eight directed transitions per cell: up to **5,000 calls** to `forge_visibility.validate_piece_trajectory` for one grant. Each call reparsed the current wall-object JSON and its line segments. This is a **static upper bound**, not a measured latency or confirmed number of executed calls.
2. `createAuthorizedNavigation.setRevision` discarded cached grants whenever a viewer fog revision changed, even if the server-authorized visible cells, collision state and published scene revision were unchanged.
3. The staged fog-frame sanitizer discarded `navigationEnvironmentRevision`, so the client could not distinguish a structural scene change from a routine sight tick. The delta/snapshot normalizers and continuity comparer now propagate and compare it.

## Staged Step 1 corrections
- SQL grant generation parses movement-blocking wall/door/window segments once per request using the same `wall_passes` permission/door-state predicate as the installed final-trajectory validator.
- Per-transition checks retain the installed exact `swept_hits_segment` algorithm and footprint-endpoint check. A conservative bounding-box check skips distant segments. Empty collision scenes require no segment collision calls. All blockers remain server-side; the returned graph still exposes only authorized directional masks.
- The client caches grants against a stable authorization key derived from the **server-confirmed** visible-cell set, map, protocol epoch, fog state, party-shared state, collision state and published environment revision. A revision-only tick retains the previous grant. Changes to sight, scene, collision, authorization identity/epoch or TTL invalidate it. The reply must match the current viewer revision, current scene revision and collision mode before it is stored.
- Missing/invalid fog authorization revokes navigation grants; delayed in-flight replies cannot resurrect invalidated grants. Existing server-side `commit_map_trajectory` remains independently authoritative.
- New data-free diagnostic counters in `window.__ttrpgMovementMetrics()`: `navigationGrantRequested`, `navigationGrantCacheHit`, `navigationGrantCoalesced`, `navigationGrantExpired`, `navigationRevisionReused`, `navigationAuthorizationChanged`; the existing duration aggregation also records `navigation-grant-rpc`.

## Verification and limitations
- Extended `tests/authorized-predictive-navigation-and-fog-2026-11-09.test.mjs` with repeat-revision, scene-change, sight-change, stale scene, expiration, invalid authorization, racing RPC and performance-structure regression cases.
- Staging-only SQL has **not** been installed in production, so no real authenticated grant RPC, end-to-end p95 timing, backend query cost or live-wall equivalence measurements are yet available. Static checks alone cannot establish performance acceptance.
- The SQL is still worst-case proportional to directed graph edges times collidable segments; performance with dense long-wall maps must be measured before final release.
- A correct deployment sequence requires all three November 9 migrations, their privileges and Realtime publication validated as a single release gate, followed by browser tests of active combat maps under the existing test-campaign policy.
- This step does not close outstanding architecture issues: secret-geometry probing, fog revocation coverage, all movement forms, full security audit, CodeQL and live stress acceptance remain separate gated steps.

## Step 1 live-test matrix (AFTER explicit deployment approval)
- 1, 10, 50 and 100 visible units on empty, sparse and dense-wall maps; two player browsers and DM browser.
- Record grant fetches per 60 seconds before and after repeated fog-only revisions; expect **no extra grant RPC** for identical authorized footprints within the existing 12-second TTL.
- Record navigation-grant-rpc p50/p95 and client input-to-paint p95 for selected token, group and tools. Assess against the full redesign targets rather than inferring speed from SQL code.
- Revocation tests: door open/close, geometry change, player map switch, lost private visibility tick, token ownership change, reconnect and grant expiry; verify movement always fails closed if no current grant.
- Roll back the matching frontend feature before modifying any migrated functions; keep `commit_map_trajectory` and server-side write guards active.
