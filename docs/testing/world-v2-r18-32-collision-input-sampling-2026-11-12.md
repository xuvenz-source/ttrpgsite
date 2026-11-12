# Tabletop Forge — B10-R18-32 collision input backpressure (isolated frontend canary)

**12 November 2026 · Australia/Melbourne · exact live R18-31 parent · production test-ground only, no SQL**

## User evidence and hard bounds

User's current DM trace (opt-in QA capture) reports: `authority.advance` 27 samples p50 **250.4ms**, p95 **544.9ms**, max **631.1ms**; `authority.commit` 8 samples p50 **1087.5ms**, p95 **1662.5ms**; `movement.release-to-terminal` 9 samples p50 **1332.8ms**, p95 **2040.6ms**. `render.frame` p95 0.1ms is **only instrumented renderer work**, not whole browser CPU. 3 server `movement.blocked` events occur during keyboard movement. First drag runs through 6 accepted batches before an explicit `path-limit` rejection; two later Begin requests reject `invalid-server-reply`. This trace does **not** prove that all latency is collision CPU: long Commit RTT persists even without a new collision, and the browser records only a coarse RPC duration. A rejected gesture followed by a Begin using a stale local endpoint is a plausible explanation for some Begin denials, but not demonstrated by these anonymized events.

Read-only inspection of actual live `public.begin_world_motion_v2` confirms server rejection can include stale canonical origin or changed scene/permission generation; its exact rejection reason is not exposed to the client. Never weaken that actor-bound behavior. Live Supabase remains **83** installed migration versions with frozen R05 `20261111023204` uninstalled; cumulative R18-17/19/20/26/27/28/30 SQL candidates are still staged and **not installed**.

## Root cause and surgical scope

The currently deployed frontend source is R18-31 SHA `d94985e1135822953c9f67d9b46d238facaaaa1f` (Vercel `dpl_DCyZdsSTjmvbT5YnMK7sjbzGTgem`). This R18-32 branch is based **directly** on that exact frontend-only source, **not** the unmerged cumulative R18-30 SQL branch. It preserves the R18-31 detached-inflight-batch fix.

**Three changes, all browser-side:**

1. **Bound high-rate coalesced pointer input** in `InputController.js`. Previously `getCoalescedEvents()` forwarded every raw hardware sample to the gesture path; a single browser dispatch could introduce hundreds of corner oscillations and expensive `canPredict` checks. Now a dispatch takes at most **four** evenly spaced representative points, including the first and last. Two-sample right-angle paths still preserve both bends. The mandatory PointerUp final coordinate is still processed. This reduces raw input work; it does not generate intermediate unauthorized cells or disable the server's full swept-path collision solver.
2. **Memoize the exact first server-denied next cell** in `MovementController.js`, rather than the far cursor target of the blocked request. If pending is empty and authorized origin is unchanged, the client computes the *first intended grid step* in **O(1)** and suppresses a redundant attempt to cross that identical cell; this works even for targets farther than the 48-cell local helper expansion cap. A different first step (a genuine route around the wall) still requires normal RPC authorization. The memo is session/approved-origin scoped and is cleared on alternate input; fog/private wall geometry is not inferred.
3. **Avoid hard gesture cancellation on a pathological full input buffer.** The existing `MAX_GESTURE_BENDS=128` remains fixed, preserving all already enqueued bends. When more pointer samples arrive while full, `updateGesture` explicitly returns `false` and records a fixed privacy-safe `movement.path-backpressure` trace event instead of rejecting an already-provisionally-approved session. **No bends are silently removed or replaced**, no shortcut is added, and previously queued work must still obtain original signed server Advance approval. A fully blocked server ACK still clears unapproved pending bends. The client can accept new samples after space becomes available. If the pointer is released while full, the final position may be the last accepted queued target, not an unsubmitted cursor endpoint; this is intentionally fail-closed.

**No changes:** world server RPCs, scene or fog geometry, secret viewer grants, token positions, handout/note pin UI, Supabase migrations/RLS/triggers, Realtime channels, observer pipeline, Vercel env flags, selected token ownership, DM/player permissions, keyboard source behavior, DM preview commit protection, or original server Commit. R18-28 atomic terminal RPC and guarded observer recovery remain off/uninstalled.

## Verification / limitations

`tests/world-v2-r18-32-collision-input-backpressure.test.mjs` covers one browser input dispatch carrying 301 hardware samples, keeping first+turning+last representative samples, distant same-first-cell denial suppression (including requests beyond 48 cells), authorized alternative first directions, in-flight input preserving real new turns, 128-bend explicit refusal without gesture cancellation, blocked ACK discarding unapproved backlog, never inventing a shortcut under saturation, unchanged keyboard/preview constraints, and fixed allowlisted QA telemetry.

The original R18-05 R17/R18-15/R18-31 checksum history is preserved and explicitly extended with this separate controller SHA. R18-15, R18-31 and World V2 Phase 2 tests are updated only where they asserted the old unbounded input or hard cancellation policy. All original collision permission/ACK validation remains active. **Final exact-source head** must pass Node/Vite/npm audit, CodeQL, isolated PG17 authority, complete database fixture and read-only production preflight before any live canary.

This package does not eliminate slow backend `authority.advance` and `authority.commit` network/SQL time, or change the strict live wall coverage threshold; those remain pending audited post-R05 SQL. No percentage of speedup is claimed. It does not validate authenticated independent DM/P1/passive-P2 fog or observer recipient isolation; those continue to block the cumulative SQL release.

## Controlled frontend-only canary gate

Deploy only the exact R18-32 branch HEAD once CodeQL + Node/Vite and both PG workflows pass and all production checks remain unchanged. Prior live rollback candidate: R18-31 Vercel `dpl_DCyZdsSTjmvbT5YnMK7sjbzGTgem`; earlier R18-24 `dpl_7HUmXi7eQ2oq2Y5HiW6r5Pvzq1HN`. Never install SQL, merge into main, or turn on atomic flag as part of this patch.

A solo DM can test (1) rapid drag toward a wall and hold the pointer beyond it, (2) turn along/away from that wall, (3) 10 corner drags, (4) repeated keyboard wall nudges. Stop on any forbidden wall crossing, map flashing, canonical position mismatch, new viewer error, or material worsening. Compare trace `movement.path-backpressure`, `movement.blocked`, `movement.reject-reason`, and begin/advance/commit latency; a low renderer p95 alone is insufficient proof of smoothness.

**Release status: source-only staging pending exact-head CI.**
