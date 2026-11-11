# B10-R11 — PR95 live movement gesture rejection diagnostics

**11 Nov 2026.** Independent client-only diagnostics change based directly on production `main@e9251b1450eb2f684707f689c12921e3ad745088`. No SQL, R05 migration, grants, additional RPCs, polling, feature toggles or paid services.

The supplied post-PR95 trace recorded nine movement grabs (three drag and six keyboard), five commits, four rejections and one blocked movement. This is a **mover's trace**, not proof that the passive Player 2 observer no longer flashes. There are no recorded `observer.invalid-frame`, renderer seals, terrain reloads or sprite-remount events in this particular capture.

Browser request latency p95 (small sample, not historical service-level latency): Begin 343.1ms (9), Advance 448.5ms (12), Commit 292.8ms (5), signed Visibility 399.7ms (11); renderer frame-work p95 0.1ms (202).

**Supported hypothesis, not a diagnosis:** a drag starts 77ms after the previous commit but before the new signed snapshot and is rejected. Production `begin_world_motion_v2` demands the exact canonical token origin; `WorldV2Board.resolveSelection` uses the most recent signed sight. A stale-origin race is possible. Other begin denials, a bad ACK or server request error can produce identical old trace events. Do not bypass ownership, collision or origin checks to hide them.

**R11 isolated telemetry:** append `movement.reject-phase` (begin/advance/commit/path) and `movement.reject-reason` (strict fixed categories) to the existing **opt-in, in-memory, 256-event WorldTrace**. Only enumerated client-side failure classes are included; arbitrary RPC error strings, IDs, coordinates, user/hidden NPC data and tokens are never traced. Movement authorization, timing, requests, active-session lifecycle and renderer operation remain unchanged. Regression tests verify all three async stages, malformed ACK denial and redaction of secret-like messages.

**Release:** eligible for a *controlled diagnostic-only production test* after exact-head Node/Vite, PostgreSQL V2, CodeQL checks and review. Then have moving DM or Player 1 clear `window.__worldV2Trace` after load, perform two back-to-back drags and several arrow-key presses, and send the sanitized trace including new categories. A separate passive Player 2 observer trace is still needed to close flashing.

**Next R12:** use the proven rejection *phase and category* to stage a targeted stale-commit/authorization repair; do not infer unsupported error causes or deploy the SQL-dependent R05 migration.
