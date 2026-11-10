# B09 — Keyboard, touch, group and DM-preview input parity

**Status:** STAGING ONLY — no live activation, SQL, migration or deployment.  
**Approval:** Designer instruction “Proceed with B09”, 11 Nov 2026; exactly this workflow microstep.  
**Parent staging:** B08 draft PR #83, exact verified head `eb1af274a1be6d0c48233a4d29b73d92c4545967`. Production remains `main@b246b3a72537b53b2afc2a9a38cbe1db3609a8af`.  
**Release:** Not approved; A06/Gate A, PR #71 and B10 integration remain blocked.

## Contract

All active inputs continue using one `MovementController` and server-authorized `begin → advance → commit/cancel` path. Keyboard preserves one rapid held gesture and sends turns/bends through the same B05 coalescer; pointer and touch use the same owner/roster/collision checks. DM player preview remains one DM-authenticated **local-only** token simulation using compiled DM geometry plus independent player-effective sight requests, with no SQL commit and no player JWT/private-channel impersonation. Group movement is authorized only when **every** intended selected token/tool remains controllable, visible in the signed roster, and under 48 pieces; server still validates every group footprint/swept path. No client-side prediction beyond a current signed grant.

## B09 modifications

1. **`KeyboardStepper.js`:** queue is bounded (configured 1–64 steps); fast keys remain a single gesture. When the previous commit completes, resume queued steps **only** if the result was `committed`, original runtime is still active/unchanged, and new authorized visibility refresh returns `true`. Denied, uncertain, revoked or failed refresh outcomes discard the queue and never invent a fresh origin; cancellation/disposal cannot replay a retired map's keys.
2. **`InputController.js`:** a second concurrent touch, even beginning outside the viewport on the owning document, cancels an active single-finger token drag; subsequent touch movement cannot accidentally commit while pan/pinch is taking ownership. A new single-finger movement may begin only after the touch chord has fully ended. Existing mouse drag, token resize, terrain pan, tool placement and pointer capture events keep their previous ownership semantics.
3. **`WorldV2Board.jsx`:** group selection is all-or-nothing for pointer and keyboard. If any group piece is no longer controllable, is a held tool, absent from the signed roster, or the group exceeds the server limit, refuse the entire gesture. Never silently move an authorized subset when the designer selected a full group. Preview selection remains a single eligible actual-player token.
4. **`PreviewAuthority.js`:** local virtual session holds its last approved coordinate and initial DM scene revision. Subsequent batches must begin at that exact coordinate, have monotonically increasing sequence, match current scene revision and obey 8 targets/24 cells per batch (matching normal authority envelope). Full local swept collision remains authoritative for the simulation; there is **still no persistent preview commit**.
5. **`tests/world-v2-b09-input-parity-2026-11-11.test.mjs`:** deterministic tests for rapid-key coalescing, rejected/uncertain backlog, failed-sight recovery, cross-runtime isolation, single/multitouch cancellation including second finger outside map, shared mixed token/tool group canonical commit protocol, preview anchor and scene revocation and single-token preview selection.

## Important limitations

- Unit tests and isolated CI only show this staged source behaves as expected under controlled authority and input fixtures; they **do not** prove live iOS/Android pointer hardware, multi-account player/DM permissions, actual Supabase Auth/RLS, opaque fog LOS, wall corner cases, renderer flashing or movement p95. Group tests exercise a controlled authority adapter and rely on separate B03/B04 server hostile tests for real SQL collision validation.
- No new public endpoint, new client broadcast, database schema, env flag, package dependency, background worker, paid service or preview deployment. The B05/B06/B08 flags retain their existing disabled-by-default behavior.
- As with previous steps, the V2 renderer may still need separate continuity work; no B10 integration, B/C release gate or production deployment was carried out.

**Next**: B10 **only after explicit designer instruction** — integrate and qualify B03–B09 (including SQL order, B07/08 deferred observer safety, real DM/P1/P2 Auth/fog/collision browser matrix, performance/flash traces, full CI/CodeQL), then request separate release authorization.
