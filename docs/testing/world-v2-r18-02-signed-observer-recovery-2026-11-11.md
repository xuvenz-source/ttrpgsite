# B10-R18-02 — Opt-in signed observer catch-up (client-only, default OFF)

**11 November 2026 · STAGED / NO-GO for production activation.**
Parent audit: R18-01 draft PR #103, head `dda0e9e795ccad18697fdb7b532c8addd4b2dd17`. Production remains R16 `main@90df8c960e79e8d66c322095611427da7bb09de4`. This branch is **stacked on R18-01**, not on R17 draft #102. Preserve both for consolidation. No SQL, RLS, token data, Supabase functions/Edge, Realtime subscription or paid infrastructure changes.

## Evidence and specific gap

Passive Player 2 recorded 51 certified private movement frames, two `unknown-piece`, two `sequence-gap`, and four fail-closed renderer/roster seals. Each seals the existing six-token view for ~0.3–0.4s; painting p95 was 0.1ms. The existing renderer correctly rejects unknown tokens, missing sequence segments and changed authorization. See `docs/testing/world-v2-r18-01-passive-observer-delivery-2026-11-11.md`.

The separate, test-proven weakness: when the **last** private movement/hide frame or dirty notice is dropped and the map becomes quiet, the current transport cannot spontaneously fetch the new final server-authorized positions or roster. A missing frame that is followed by another triggers a protective sequence-gap resync, but an indefinitely missing last frame leaves the receiver visually stale.

## Implementation ported from B10-R02 staged PR #87, reconciled against live R16

1. **Foreground-only, single-flight signed sight recovery**, at a **12-second default interval** (vs old R02 6s). Uses the existing `get_world_visibility_v2` Auth-scoped RPC exclusively. No new socket/topic/worker, raw observer coordinates, public cursor, or movement write. At most one recovery request in flight; schedules the next interval after the previous settles. Background tabs, disconnected or locked channels, unauthorized/stale scene, local active gestures, DM player-preview and in-progress R16 targeted sight recovery make **zero** recovery requests. On foreground resume, schedules one immediate check; disposal cancels timers/listeners.
2. Existing `WorldV2TabletopRuntime` adopts complete independently authorized signed sight in `WorldRenderer` **before** aligning `RealtimeTransport.acceptSignedSight`. The transport validates viewer/map, cursor >= current, exact scope/environment/permission generation, integer positions and roster. Invalid or stale snapshots cannot grant new sprites or change cursors. Permission/scope drift synchronously seals and resyncs the old private stream. The renderer remains the **only** sprite-granting authority.
3. Newer signed positions install a **private origin fence**. Older in-sequence deferred private paths beginning behind the certified endpoint consume their cursor but are **not painted**. Only a fresh route starting exactly at the certified signed endpoint may resume normal cosmetic animation. An independently signed hide still excludes the hidden token from the roster, even if a delayed private path mentions its ID. Invalid packets, missing sequences, forged viewer IDs, unknown-piece and revoked permissions retain the original full fail-closed treatment.
4. **Default OFF**: `VITE_WORLD_V2_OBSERVER_RECOVERY=1` is the only opt-in. The app does not enable that environment variable or deploy any staging commit. Do not activate until authenticated DM/P1/P2 fog/LOS tests and free-tier resource measurements pass.
5. The ordinary signed sight request is not a guaranteed deadline under network loss, page suspension, service throttling, or denied credentials; at 12-second cadence it provides eventual convergence, **not** crisp real-time motion. It does not prevent the four observed `unknown-piece`/ `sequence-gap` blackouts; a separate coupled authority/roster protocol repair is required for smooth authorized transitions.

## Automated acceptance

`tests/world-v2-r18-02-signed-observer-convergence.test.mjs` exercises:
- 12s initial delay, no extra boot request, single-flight and reentry, foreground/background, stopped/disposed timers, error backoff;
- signed canonical correction fences delayed old paths without revocation or new Realtime channel, permits a later path from the signed cell;
- genuinely dropped terminal path: even with no further Realtime frames, a later signed sight advances recipient cursor and provides canonical endpoint after the renderer has accepted the frame;
- lost hide/no signed roster => no concealed sprite creation; unsigned/wrong-viewer/malformed/cursor-regressed frames never grant positions;
- permission or scope changes seal old authorization before old motion can render;
- source contract proves default-OFF production flag, preview prohibition and proper listener disposal.

Historical R18-01 51-frame four-seal regression remains unchanged as a precise **current behavior** baseline. Real Chromium input tests, lint/build/production audit, CodeQL and free/isolated PG authorization CI must pass at the exact final PR head. CI does not prove real post-activation browser behavior.

During first CI, Chromium startup on a loaded runner failed intermittently while no R18 watch was active. This staging branch lowers **Node test worker concurrency from 4 to 2** in `package.json` (test execution only), preserving the same test coverage and production runtime. Exact-head CI is required after correction.

## Next release gate (R18-03+), **not included in this patch**

Reconcile older **B08 #83 terminal Commit recipient drainage**, **R03 #88 stale queued path retirement**, **R05 #90 targeted migration/recovery** and **R02 #87 signed fallback** with the current live schema and PR #71 security amendments. Avoid blanket migration pushes: remote Supabase migration history differs from repo files. Separately authorize any new migration only after review and free-tier resource plan; policy requires subsequent live tests on the existing disposable campaign, not purchasing a test database.

**Protected test matrix**: real DM/Player1/Player2 on published fog + walls, hidden NPC entry/exit, actual line of sight and party-shared vision, permission revoke mid-stream, unknown-piece timing, deliberate missing sequence, dropped terminal frame with quiet map, reconnect/multi-tab, user/DM simultaneous gestures, repeated drag, DM preview local, 2×2 token footprint, scene generation change, frame flood, invalid signed data, 12s watch sampling of CPU/RAM/Realtime and sight p95. Prove canonical convergence and no private leaks. If any fail, leave both client flag and staged SQL unactivated.

**Handoff:** This is a *client-only, flag-disabled intermediate implementation*, not an observer flashing fix or release-ready motion redesign. R17 #102 remains independent/unmerged and ready only for integration review. No production deploy.

## Exact-head CI against current production main

PR #104 is deliberately **targeted at `main` for qualification**, although its source branch is stacked upon the R18-01 audit commit. This exposes the combined R18-01 + R18-02 diff to the repository's CodeQL and source-real PostgreSQL workflow triggers (which currently only run on PRs targeting `main`). The two components remain separately tracked, unready and unmerged; this is not approval to ship either. R17 PR #102 remains a separate integration dependency. A successful push-only test is not a substitute for these required PR checks.

At a 12-second cadence, 10 continuously foreground, authorized viewers would request at most ~0.83 extra signed visibility RPCs/second in steady state (not a measured rate; one-flight and authorization/background guards can reduce it). That still invokes database fog work and must be measured on Supabase Free before enabling the opt-in. Under complete network loss the watch offers **no** guaranteed convergence deadline.
