# B10-R12 — Server-confirmed commit origin handoff

**11 November 2026, isolated client-only live-test candidate.**

## Evidence and diagnosis
Designer PR96 trace: Drag #1 committed at 14,052 ms. Drag #2 began at 14,063 ms — **11 ms later** — and failed at Begin with `invalid-server-reply` at 14,263 ms, before the next signed sight result. Live SQL's `begin_world_motion_v2` validates the supplied first-token origin exactly against the canonical database position and checks actor rights, map, rules and permission revisions. The frontend's normal pick origin comes from its last signed roster, which may be older than a just-committed token. This makes a same-actor stale position the leading, source-grounded explanation; the trace still cannot distinguish every server-null denial reason because the function returns NULL instead of a typed code.

One keyboard gesture had **14 approved** batches and then `movement.cancelled` ~76ms after release (not a rejected ACK). There is currently no evidence of the caller's cancellation reason. A new fixed, privacy-safe `movement.cancel-reason` trace event identifies the reason in the next live check; no attempt to bypass scene/permission revocation is made.

Small-sample browser p95: Begin 308.8ms (4), Advance 314.5ms (19), Commit 225.2ms (3), signed sight 238.7ms (4), renderer frame work 0.1ms (145). Serial RPC cost remains a separate architectural problem.

## Isolated code
- Introduce a 3-second maximum `CanonicalCommitHandoff`. Only a successful exact server-ACKed `committed` motion event with a still-authorized renderer can store the endpoint, and only for the same actor/viewer, map, exact token selection, scene, environment revision and permission generation.
- A new gesture may use that authenticated endpoint for Begin **only while its original signed roster remains unchanged**, until the next signed frame catches up. A different canonical position, permission/viewer/map change, concealed/deleted actor, timeout, revocation, reject, cancel or disposal clears it. The original server begin authorization and origin comparison remain unchanged.
- The renderer carries the exact same visible sprite anchors forward on an immediate same-selection follow-up; it does **not** create a sprite, grant new fog, bypass LOS, broadcast client-authored coordinates, alter server rules or create extra RPCs.
- Preserve the separate DM player-preview virtual path, which never uses a real DB committed endpoint.
- In-memory opt-in `worldV2Trace=1` reports `movement.canonical-handoff: reused-commit` and an allowlisted `movement.cancel-reason`, never IDs, coordinates, private payloads or backend text.
- All R05/R02/B05 staged feature flags stay OFF, database migration history untouched.

## Release gate
Exact-head Node and browser React/Vite tests (including two quick actual DOM drags with deliberately stale signed sight and a strict canonical-origin fake server), PG17 V2 and CodeQL must pass. The test fixture is a disposable local simulator: **it is not a real P1/P2 fog-protected authorization test**. Controlled production live testing may be authorized under the designer's existing permission only after those checks pass. If server rejection persists, stop and investigate function-specific NULL denial without relaxing auth. Confirm Player 2 has no invalid frames/terrain flashing separately.

**Next step:** B10-R13 — collect new actor trace and passive P2 trace. If R12 reduces quick-drag denial but serial 200–300ms advances remain, reconcile the staged B05/R05 coalescing redesign using the governed migration process rather than ad hoc SQL.
