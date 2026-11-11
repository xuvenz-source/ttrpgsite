# B10-R16 — Valid observer-path discontinuity: signed recovery without full-map blackout

**11 November 2026. Status: STAGING ONLY / NO-GO for production until accepted.** Base production `main@c1e098f0287c1cbf78c1f74586507ee0b4809bb5` (R15 live). No SQL, Supabase migration, Realtime grant, RLS, server RPC contract, or deployment.

## Paired live evidence (same user test session, different bounded trace windows)
The DM was the mover; Player 2 was passive. Player preview on the DM is intentionally local, should not be received by Player 2, and is not used when comparing shared movement. The traces have relative timestamps from their individual browser clocks: no cross-browser packet ID or synchronized recording time proves one-to-one event correspondence.

- DM later sample: 9 gesture grabs; 8 committed real gestures and **1 keyboard rejection** after repetitive blocked steps; 14 `movement.blocked`. Rejection: `movement.reject-phase=advance`, `movement.reject-reason=invalid-server-reply`. Browser RPC durations, in ms: Begin 9 samples p50 183.3/p95 399.3; Advance 34 samples p50 203.9/p95 322.3/max 458.2; Commit 8 p50 191/p95 251.7; signed Visibility 9 p50 191.9/p95 291.4. Rendering 256 samples p95 0.1ms.
- Player 2 later sample: **27** accepted private observer frames, p50 interarrival 261.5ms, p95 2432ms (includes quiet intervals). At relative 1,111,031ms, `renderer.seal=observer-path-discontinuity`, followed by **6 sprite removals**, opacity, four seals total, a signed scene/sight recovery and six sprite creations plus one full fog redraw at relative 1,111,523ms. Subsequent 17 accepted frames show recovery. This is a real renderer reset, not evidence of routine paint slowness.
- No hidden information or unauthorized rendering was demonstrated; failures are availability and visual-continuity issues, and all sight/observer security gates remain mandatory.
- Read-only cumulative `extensions.pg_stat_statements` from live Supabase (not session-specific): Begin 426 calls 20.4ms mean SQL, Advance 924 calls 42.6ms, Commit 367 calls 92.1ms, Visibility 1,041 calls 40.1ms. Browser total RPC medians around 180–204ms are much higher. Do not attribute all of this delta solely to geographic network latency without a per-request correlated profile; avoid confusing cumulative average SQL with live trace p95.
- Current SQL source `public.advance_world_motion_v2` contains fail-closed `RETURN NULL` branches for expired/invalid session, stale permissions, sequence mismatch, attempted-cell limit 128 and 64-batch cap; client `AuthorityClient.requireReply` classifies null data as `invalid-server-reply`. Logs do not prove which SQL branch caused this isolated rejection. **Do not widen these limits or introduce unsafe client replays.**

## Verified client cause
`WorldRenderer.applyObserverPath` passed the transport-enforced private frame shape and sequence checks but `ObserverPathBuffer.applyPath` returned false. The prior code treated **both** a valid-route/buffer mismatch and an actually malformed path as a global authorization seal. Board `onNeedResync('observer-path-discontinuity')` then forced a complete scene and visibility reauthorization, tearing down every sprite and painting an opaque fog canvas.

Potential internal causes include a signed canonical roster update racing a queued server-approved route, or a capped cosmetic queue; this trace does not distinguish them. Either must be reconciled **only** by a fresh signed sight frame, not a client-invented path.

## R16 client-only mitigation and safety invariant
1. Add `ObserverPathBuffer.inspectPath(item)`: `ok`, `origin-mismatch`, `backlog`, `invalid`, or `unrostered`. It validates the same strict adjacent route, authorized piece, exact origin and bounded pending count as `applyPath`; it does not expose private positions.
2. For **only** `origin-mismatch` or `backlog` from an otherwise valid private, in-sequence, same-authority event: do **not** render the mismatching route. Mark just the affected piece as awaiting fresh signed sight; consume its sequence, preserve the previously authorized fog and other sprites, and request one non-destructive `observer-path-await-vision` signed sight refresh. Independent already-certified sprites may continue to animate.
3. A new signed frame remains the **only** permission to reconcile positions and sprite roster. Hidden/missing pieces are removed by the signed frame. No interpolation across an unknown segment, no optimistic collision, no public coordinates, no socket/channel change.
4. Malformed/nonadjacent routes, unexpected sequence gaps, other authority/scene/permission changes and expired authorization retain their existing fail-closed seal path. The current one-bit visibility queue and async authorization retry remain unchanged.
5. Opt-in privacy-safe `renderer.observer-discontinuity` event uses only `origin-mismatch` or `backlog` and never logs IDs, positions, paths, user data, raw JSON or errors.

## Automated qualification
The extended Phase 8 renderer test covers (a) stale path origin retains previously signed fog, terrain and all sprite nodes while independent ally movement continues; (b) a bounded 96-waypoint cosmetic backlog defers to one signed refresh, not an all-map seal; (c) malformed route and genuine sequence gap still seal; (d) signed roster may still conceal a deferred token; and (e) fixed whitelisted trace labels reject coordinate contents.

Initial branch CI, before ledger/documentation amendment: 803/803 Node tests passed, 0 failed and 0 skipped; full build/lint/audit/Deno checks completed. **Repeat exact final-head CI and CodeQL, PostgreSQL role checks and full diff review before proposing release.**

## Controlled live acceptance criteria
After approval only: DM and passive Player 2, normal mode (not DM preview), rapid taps and turns, drag / immediate drag, wall blocked paths, fog boundary, hidden NPC enter/leave and reconnect. Capture both `window.__worldV2Trace.snapshot()` outputs. Require **zero unauthorized sprites, zero map-wide blackouts**, zero non-authorized motion, uninterrupted allowed independent sprite movement, no new rejected gestures and no repeated resyncs. A valid buffer mismatch may now show `renderer.observer-discontinuity` + `renderer.observer-await-vision`, followed by a signed `visibility.snapshot`, with no `renderer.seal` from that benign cause. An invalid sequence or permission change must still conceal immediately. If these gates are not met, revert the frontend-only candidate.

## Separate next engineering step: DM keyboard blocked/rejection
The 14 blocked movements and one `invalid-server-reply` warrant isolating Advance's exact null case. Do **not** treat R16 as a fix for held-keyboard session budgets, sequential RTT or server-authorized collision. Propose a separate test-proven R17 design to reduce redundant blocked attempts without bypassing collision or authorizing hidden paths; only after identifying the failure mode.

**Handoff:** R16 staged frontend-only / no release. Supabase was read-only. Remain on the existing free-tier plan.
