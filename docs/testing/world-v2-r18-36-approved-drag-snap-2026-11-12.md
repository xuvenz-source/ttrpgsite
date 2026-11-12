# B10-R18-36 — Server-approved drag presentation without cosmetic catch-up

**Date:** 12 November 2026, Australia/Melbourne. **Release source:** R18-35 live canary Git `5ca8c83bdef4a5d9870020b0f2b16723f7790e38`. **Database:** unchanged. Stage/release independently; do not merge cumulative R05 staging.

## User evidence from R18-35 live testing
The DM reports improved collisions but noticeable rubber-banding at speed, and slow snapping when dragging a token to cells. The redacted local R18-35 trace recorded:
- `authority.advance` n=70, p50 **220.1 ms**, p95 **321.6 ms**, max **423.5 ms**.
- `authority.commit` n=5, p50 **1008.2 ms**, p95 **1070.6 ms**.
- `movement.release-to-terminal` n=5, p50 **1351.3 ms**, p95 **1693.8 ms**.
- `visibility.rpc` n=10, p50 **202.4 ms**, p95 **367.2 ms**.
- First drag `movement.grabbed` at 8179 ms and first `movement.approved` at 8955 ms: **776 ms** to server-acknowledged move in that instance. Renderer work is a different measurement, p95 **0.1 ms** for the instrumented draw body (not full browser frame time).
- During continuous keyboard interaction, a separate `invalid-server-reply` rejection occurred. Read-only live server source confirms `forge_world_v2.advance_core_v2` limits a session to 64 batches, 128 attempted cells and 64 stored route runs, with a 60-second absolute lifetime; not enough evidence to attribute this one failure to any specific cap. Server session caps are left unchanged.

## Strict R18-36 patch
1. **Cosmetic local ACK presentation:** `WorldRenderer.js` recognizes only a controller-issued `drag` or `touch` gesture mode recorded at grab. After server-valid `approved` with no active prediction, it directly displays the latest **approved endpoint** on the following frame. It no longer replays that ACK through another 105 ms cosmetic catch-up queue. Real keyboard and preview retains the existing approved-path interpolation. Blocked ACKs, rejected motion, revocation, renderer authorization, fog masking and canonical commit are unchanged.
2. **Controller event extension:** `MovementController.js` attaches its own enum `mode` to locally emitted events. It does not alter Begin/Advance/Commit requests, accepted-path validation, the R18-31 queue detachment, terminal noMotion, collision enforcement, retry behavior or session rules.
3. **Bounded diagnostic coverage:** Only when an integer pointer-intent cell changes, record an allowlisted `movement.prediction` `granted|denied` result. An actual direct approved drag presentation records `movement.presentation:snap`. `WorldTrace.js` has a strict new event/detail allowlist, with **no position, actor, token, wall geometry, URL, RPC payload or error messages**.
4. **Tests:** exact source pinned back to reviewed R18-35 controller, separate new R18-36 blob; real renderer fake-clock tests prove approved drag immediately appears, keyboard unchanged, unknown mode cannot opt into snap; predicted vs unpredicted and privacy/error checks; full unchanged legacy authority and source locks.

## Explicit limits and next gate
- This removes only **client-side cosmetic interpolation after server approval**. It cannot eliminate the up-to ~776 ms *initial* round-trip/authorization delay, accelerate the ~1 second real Commit, or grant the player permission to predict unseen wall paths.
- A successful visual improvement may look like discrete approved-cell updates rather than interpolated motion; verify that perceived stutter is actually better before retaining it live.
- We must separately study the bounded session / invalid reply in R18-37, without increasing server limits, bypassing rate guards, or leaking fog/LOS.
- Check exact-parent file list excludes any SQL/Edge/grants/config/dependency edits; all build/lint/audit/CodeQL/PG17 suites. Live-test only in isolated campaign with R18-35 deployment `dpl_GtaJ4PoxHzXDpN7L46nka8Kqb8mN` retained for immediate rollback. Any new deployment must use this **exact verified** SHA, never cumulative R05 staging.
- This step has no basis to authorize independent DM/P1/P2 fog/LOS revocation release.
