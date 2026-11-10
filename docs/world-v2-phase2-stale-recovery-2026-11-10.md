# World Engine V2 Phase 2 — same-authority stale visibility recovery (10 November 2026)

## Source diagnosis
A player can receive an authenticated private observer movement packet before an earlier visibility RPC finishes. The renderer previously treated that valid snapshot's lower cursor as an authorization failure, clearing the fog canvas and destroying all sprite nodes; the visibility controller could revoke the same trusted state again. Older private vision-dirty notices also invalidated newer sight when their permission generation was lower.

## Staged integrated fix
- Validate the scene, scope, and permission generation before deciding a cursor regression is harmless.
- Ignore a *proven same-authority* lower cursor or vision epoch instead of replacing the last server-authorized roster, fog mask, sprites, or terrain. A stale frame cannot reinstate a hidden token.
- Roll back the visibility controller's provisional frame if the renderer already knows a newer private observer sequence.
- Attempt at most two additional observer sight RPCs after a soft stale response, never unlocking a stream based on an ignored frame.
- Ignore older vision dirty notices only when every revision and vision epoch is <= the current authenticated snapshot. Newer or incomparable security generations still trigger fail-closed revocation.
- Preserve the existing security behavior for malformed frames, new permissions, scope changes, unknown roster entries, actual sequence gaps and disconnects.

## Validation and limitations
Automated tests cover 100 late same-scope snapshots, hide anti-resurrection, a private motion packet racing an older RPC, stale dirty notices and genuine permission revocation. Phase 1 instrumentation remains on the same staging branch and draft PR.

**100 real browser movements without blackout is not yet verified.** A genuine observer sequence gap, disconnect or unknown piece still invokes fail-closed recovery and can clear the scene. These cases require authenticated trace evidence before altering the recovery policy. No production deployment, Supabase migration, new channel, or paid service is included.
