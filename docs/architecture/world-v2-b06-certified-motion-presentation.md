# B06 — Certified local fractional movement presentation

**Engineering step:** B06 only; staged frontend, feature OFF by default.  
**Recorded:** 11 November 2026 (Australia/Melbourne).  
**Production baseline:** `main@b246b3a72537b53b2afc2a9a38cbe1db3609a8af`.  
**Staging parent:** B05 draft PR #80 at `62d92eae16fc8b886c8c62f68cd62f0ca356bbb5`.  
**Authorization:** Designer explicitly instructed **“Proceed with B06”**. This authorizes *B06-only staging and verification* under a separately documented, narrow sequencing deviation. It does not waive **A06 BLOCKED / Gate A NOT PASSED**, approve B07+, enable a build flag or deploy anything.

## What exists already

The live, unchanged World V2 sight SQL `20261109102100_world_engine_v2_visibility_snapshots.sql` generates `predictionGrants` for a bounded set of player-controlled visible pieces (at most 8). For each eligible token/tool, the server verifies an expanded stationary footprint in each one-cell sign quadrant against `forge_world_v2.step_allowed`. Fog-enabled viewers additionally require the relevant adjacent cells to be visible. No wall mesh or NPC secrets are included in these grants. That is the existing **server certificate**; B06 does not mint permission or expand allowed movement.

The staged controller already has an optional local prediction callback and the existing renderer has one local sprite presentation owner. Both paths previously had only a boolean prediction decision without a snapshot-bound identity on the *presented* event. B06 couples the cosmetic position to the exact authorized sight and independently checks it again at the renderer boundary.

## New, narrowly scoped implementation

- `src/engine/v2/CertifiedMotionPresentation.js`: pure, bounded certificate builder and validator. The only permitted optimistic offset is at most one cell along both axes relative to a **current server-authorized visible anchor** and one of its **server-certified safe quadrants**. All selected pieces (up to 48) must each have current matching grants; no synthetic group grant, hidden NPC, speculative second cell or out-of-scope audience can qualify.
- `src/engine/v2/MovementController.js`: optional `certifiedMotion=false` + `certifyPresentation` callback, independent of B05 coalescing. When enabled, the controller accepts a certificate only for its exact map, approved anchor, permission revision, environment revision, and submitted pointer. It emits cosmetic `presented` with certificate metadata, never a canonical write. Leaving the grant, receiving a server ACK, or learning of revoked/superseded sight causes a `presentation-reset` event back to the latest server-approved coordinate. The current preview and legacy prediction paths remain unchanged when the option is false.
- `src/engine/v2/WorldV2TabletopRuntime.js`: **disabled-by-default** `VITE_WORLD_V2_CERTIFIED_MOTION=1` build-time opt-in for ordinary player viewer mode **only**, and only while renderer + scene + server sight are coherently authorized. DM's current known-geometry preflight and DM player preview stay on their existing paths. An accepted signed sight refresh passes the current normalized frame to the controller for immediate revalidation.
- `src/engine/v2/WorldRenderer.js`: independently validates every B06 certificate against its current normalized sight, scene, selection, local approved anchor and pointer. The renderer cannot display a B06 position if those do not all agree. On a superseding sight cursor/vision epoch or **silent removal of a quadrant with the same cursor**, it clears the certificate and repaints the existing sprite at the approved position. On a blocked/approved server reply, it discards the previous fractional display. Never remounts terrain, fog canvas or sprites for a cosmetic move.
- `tests/world-v2-b06-certified-local-presentation-2026-11-11.test.mjs`: 13 focused deterministic tests covering the exact group/grant/renderer/cancel/revocation contract. No browser JWT sessions or production SQL.

**Feature boundary:** Nothing is activated without an *explicitly authorized future build* with `VITE_WORLD_V2_CERTIFIED_MOTION=1`. B05's `VITE_WORLD_V2_COALESCE_MOTION=1` remains an independent optional flag. No environment setting was changed. The pre-B06 controller remains the default.

## Safety guarantees and trust boundary

1. **Server owns movement and fog:** B06 never writes `map_tokens`, `campaign_tool_issues` or `motion_sessions`, adds no API route, extends no prediction quadrants, and sends no client-authoritative Realtime packet. It only proposes where an already-identified local sprite is painted **until the next server reply**. The server still validates all actual steps and final commits.
2. **Current, private, finite proof:** A B06 candidate must match viewer ID, map, scene revision/generation, permission generation, sight cursor and vision epoch. It must be based on the signed server sight's visible piece origin and current grant. No crossing into a second cell can reuse the grant. Unpublished/stale/DM/mismatched scenes fail closed.
3. **Group semantics:** For rigid movement of multiple tokens/tools, *every* selected member requires its own matched safe grant in the same displacement quadrant. If the server supplies at most 8 grants and a 9-member group moves, **cosmetic prediction is intentionally disabled**, not replaced with unverified client collision.
4. **Blocked and revoked:** A blocked first step, missing quadrant, new signed snapshot, role/map change or invalid authority response cannot retain an optimistic pixel position. The renderer resets to server-approved coordinates (or seals/removes sprites entirely on full permission revocation). Renderer checks current grant again rather than trusting a `predicted` boolean from the event.
5. **No hidden geometry leakage:** Certificates include only the public V2 map/viewer/revision/epoch identifiers and the one-cell allowed origin/pointer. They never include wall objects, room geometry, hidden NPC roster, unapproved path or secret fog cells. Local painting does not expand the fog mask.
6. **No new worker or per-token timer:** B06 uses the same World V2 renderer scheduler. It does not introduce an independent animation loop or server poll. Client memory cost is constant per active gesture and bounded by the existing max 48 selected pieces.

### Why this is not automatically a complete UX fix

Server-issued prediction grants are finite and deliberately conservative. They are unavailable when an actor's current coordinate has moved beyond the last signed sight roster, if fog or collision data cannot prove a safe quadrant, or if a large mixed group lacks individual grants. A move outside those conditions continues through ordinary server validation (and B05 coalescing when enabled), with no unsupported instant prediction. **B06 does not remove server RPC latency**, rebuild the observer transport, eliminate hidden-wall wait, or establish a real-world millisecond improvement. A06 live multiplayer baseline and B10 acceptance remain required.

### Validation and release blockers

Tests exercise: precise fractional allowance; one-cell bound; wrong/revoked audience/scene/epoch/permission; hidden token, altered anchor, duplicate group member; missing tool grant; forged event; renderer's independent recheck and no-sprite-remount; sight epoch/cursor refresh; same-epoch removed quadrant; denied server prefix; local cancellation/late ACK; opt-in default false.

**Test type:** deterministic NodeJS authority fixtures and mock World V2 renderer/visibility, plus standard GitHub Actions CI. These checks are not browser frame-rate measurements or authentic Supabase JWT/RLS/Realtime/LOS integration. No new migrations, Edge functions or live database operations are involved.

Still blocked:
- **A06 / Gate A:** authenticated DM, Player1 and Player2 protected map test plus bounded A05 telemetry, p95 and flash counts unavailable.
- **PR #71:** sight recovery/input-lock and authorization amendments from A02 remain AMEND BEFORE MERGE.
- **B04 H39:** the current public Advance RPC treats altered same-seq payload as cached retry ACK instead of denying mismatch. No speculative display fixes a server-side idempotency contract defect.
- **B07:** private observer delivery frequency and free-tier broadcast budget still to be implemented and measured.
- **B08–B10:** final atomic reconciliation, collision/fog/race security, full integration and specific release approval remain outstanding.

**Next:** B07 ONLY — recipient-specific observer coalescing/budget (not implemented here); Gate A or a separate staging-only sequencing decision required. No merge, SQL apply, flag activation or deployment under B06.
