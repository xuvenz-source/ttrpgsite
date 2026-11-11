# B10-R17: blocked keyboard cursor correction, paired observer divergence investigation

**Date:** 2026-11-11. **Status:** STAGING ONLY / production remains R16 `main@90df8c960e79e8d66c322095611427da7bb09de4`. Existing live campaign is disposable testing only. No database writes, migrations, RLS changes, Edge changes, new channels, new server RPCs, or deployment.

## R16 live report, preserved verbatim in meaning
DM moving, Player 2 passive. Mild movement delay persisted; at least once DM and Player 2 showed DIFFERENT positions for the same shared token; near fog-boundary collision, movement became severely laggy and hard to manoeuvre; DM player preview remained correctly local. Screenshot showed `window.worldV2Trace.clear()` and a `copy(JSON.stringify(window.worldV2Trace.snapshot(),null,2))` typo, whereas `window.__worldV2Trace.snapshot()` worked. Correct commands, once trace enabled in each browser: `window.__worldV2Trace.clear()`, then `copy(JSON.stringify(window.__worldV2Trace.snapshot(), null, 2))`. Request both moving DM and passive observer JSON traces immediately after a reproduction. Unverified screenshot cannot establish the exact cause of divergence.

## Confirmed input bug and R17 scope
`KeyboardStepper` tracked each unapproved key press by incrementing a local `cursor`; when an Advance ACK rejected a wall/fog-boundary crossing, `MovementController` correctly cleared its pending route but the keyboard cursor stayed beyond the denied edge. Subsequent turns could therefore request remote waypoints across an invisible collision barrier, generating extra sequential ~200 ms authority RPCs or invalid sessions.

R17:
1. Derive the EXACT first denied adjacent waypoint from `MovementController`'s validated server ACK and already-sent expansion route. Never trust the client to invent denied geometry; never log its coordinates/IDs.
2. On `blocked` event, rebase `KeyboardStepper` to the LAST SERVER-APPROVED cell. Cache only the denied adjacent edge for the current live held gesture.
3. Repeated pressure in that same denied direction is consumed locally without more RPCs or input-cursor drift. A different arrow direction immediately generates a new server-authorized request from the approved cell. Release, gesture cancellation/disposal or context switch resets the cache.
4. DM preview and player keyboard gestures share this same function. Mouse dragging and the fundamental sequential Begin/Advance/Commit latency are NOT changed by R17.
5. Add deterministic real MovementController+KeyboardStepper test: several queued eastward steps hit a wall, one `blocked` ACK includes certified denied next cell, 15 repeated blocked inputs make **zero** extra authority requests, northward turn generates exactly one new valid Advance, and final Commit ends at the approved position. Additional test ensures malformed/nonadjacent blockedAt cannot be cached; source-level board wiring check.

## Separate high-priority R18 observer/commit consistency blocker
**Verified from read-only inspection of installed live Supabase functions:**
- `public.advance_world_motion_v2` calls private `forge_world_v2.advance_core_v2` and publishes approved private observer paths + conditional recipient vision notices, but never updates `public.map_tokens.x/y`.
- `public.commit_world_motion_v2` finally persists authoritative token/tool x/y, but contains no call to `signal_movement_vision_v2` or `publish_approved_observers`.
- Live `world_v2_token_roster_changed` triggers on visibility/ownership/footprint/character/map metadata, not x/y position changes.
- `get_world_visibility_v2` delegates to `forge_world_v2.visibility_frame_v2`, which reads canonical pieces.
- R16 `WorldRenderer.adoptVisibility` resets a deferred piece's cosmetic route to signed `visiblePieces` as soon as the private frame cursor is covered. Since an Advance may be authorized **before Commit**, that signed snapshot may still carry the old persistent position; if no terminal private refresh is delivered after Commit, the observing renderer can remain at its previous position despite the DM having moved. This is a **code-supported failure mechanism**, not conclusively tied to the reported instance without matching DM/P2 traces.

Do NOT patch this by accepting unsanctioned coordinates, replaying unseen path segments, granting hidden NPC roster or skipping signed sight. Draft a separate R18 commit-authoritative terminal reconciliation proposal that either securely invalidates recipient signed sight at persisted Commit or makes the private server-authorized terminal event explicitly distinguishable from provisional path frames. Respect private recipient RLS, exact per-viewer scope, monotonic cursors, scene and permission generations, fog/hidden NPC security, atomic commit outcomes, replay/reconnect recovery, dropped broadcasts and free-tier CPU/RAM. Review previous NO-GO B10 R05–R09 migration proposals for overlap and history conflicts BEFORE any migration. A DB migration requires separate designer release approval, and the current live Supabase must not be touched during staging.

Fog/collision latency must also be measured by comparing blocked ACK counts, Advance p50/p95, signed visibility p50/p95, and per-player `observer.frame-accepted` after the console correction. Fog itself is **not** a collision authorization surface: unseen walls still block server-side and client must not reveal them.

## R17 release gate
Exact-head Node tests including real Chromium board, production build/audit, ESLint, CodeQL, isolated PostgreSQL private authority tests, complete PR diff security review, and explicit designer approval before a controlled Vercel main merge. In live: DM and player key-hold against a wall, release/reverse/turn, ordinary drag, protected fog, hidden NPC, preview locality, 2-client position convergence. A successful R17 keyboard test is **not** R18 observer acceptance. Do not claim divergence resolved, nor deploy R17 into a campaign with unresolved security changes.
