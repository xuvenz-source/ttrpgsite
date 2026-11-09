# Unified Real-Time Movement — Staging Engineering Ledger
Date: 2026-11-09
Branch: `stage/unified-realtime-movement-2026-11-09`
Base production/main SHA: `ab905866306e9a0669287ac4b7e620c4ee33c880`
Primary handoff: `TTRPG_Unified_Movement_Engine_Design_Handoff_2026-11-09.md`
Status: **PARTIAL / NOT RELEASE READY**. No production migration, merge or Vercel deployment is authorized.

## Ground truth / compatibility
- Main and the most recent Vercel production deployment matched `ab905866` at audit time. Main includes PRs #55 and #56.
- Existing Supabase migrations through `20261109000400_concealed_navigation_gestures.sql` are applied; production `advance_authorized_navigation_gesture` still only validates ONE adjacent crossing, with ±12 offset bounds.
- The `development` branch is far behind main and must NOT be used as a base. Old predictive-navigation staging is fully behind main.
- Open draft PRs #20/#21/#32/#33 are diverged historical branches. `password-breach-check.js` from #21 is byte-for-byte present in main; many #32/#33 features have later versions in main. Do not blindly cherry-pick old components. PR #20's unreleased private-NPC-artwork SQL *candidate* remains separate and absent from main; it is not an applied migration.
- Existing published map geometry and light/fog rules live in `public.map_environments` (prepared/live/revision). Exploration persists in `forge_visibility.exploration`. Existing viewer fog delta and stable canvas mechanisms are preserved, not rewritten blindly.
- Production query statistics sampled during audit (cumulative since their stats reset, NOT controlled latency or before/after): fog-full 1,890 statements at 92.70 ms mean, fog-delta 175 at 100.99 ms mean, trajectory-commit 178 at 344.65 ms mean, original concealed-step 19 at 16.96 ms mean. These explain the concern but NOT client RTT, SQL p95, memory RSS, or causality.

## Status against required work packages

| Package | Implemented on this branch | Still required before release |
| --- | --- | --- |
| WP0 Ground truth & instrumentation | Audited GitHub/main/staging, Vercel SHA, applied Supabase migration and function signatures. Added aggregate local/remote frame latency, secured-batch RPC timing, fog delta/full repaint and token sprite mount counters, without coordinates or private IDs. | Browser baseline with DM + 2/4/8 players and actual Supabase SQL/WAL/RSS/swap comparison; no live campaign session was performed. |
| WP1 Unified gesture input | Fast pointer bends are compressed safely and drained across bounded multi-cell batches. Pointer-up retains final intent, and cancellation/scene authority checks remain. Existing shared board handles token/tool/group pointers; keyboard and DM preview routes remain. | Centralize all remaining gesture lifecycle booleans into one explicit state machine; test touch, rapid backtracking, map switch and mid-gesture owner changes live. |
| WP2 Batched private authority | Prepared additive `advance_authorized_navigation_gesture_batch` RPC. Actor-owned session locked, current map control/permissions, published scene generation, tool/character state and every footprint swept. Maximum 12 bends/48 validated cells per request, 128 validated cells and 64 requests per session, neutral denial, no private geometry response. Existing RPC is left intact for rollback. | **Critical:** SQL syntax and role integration require testing against an authorized non-production equivalent or after explicit designer-approved production migration. Review hidden-wall probing/time budgets, rate limits, character attribute revocation and server-recipient motion. The browser cannot cryptographically prove that a pointer route was genuine. |
| WP3 Stable renderer & reconciliation | Local sprites and monitors use imperative RAF translation; locally known permitted edges now allow continuous fractional-pixel movement; removed competing CSS `left/top` transition. Remote settling no longer clears a valid preview on a timer before canonical DOM handoff. | **Critical:** Implement per-viewer **validated path** transport to render multi-corner moves without a straight-line shortcut. Fully unify observer version/canonical ordering and all tool/torch/light decorations, including cancel/reconnect. |
| WP4 Published scene, incremental fog | Audited existing persistent scene, revision and exploration model. Preserved server-authoritative `adoptVerifiedViewerTick`/delta and canvas cell-diff painting. Added measurements of genuinely full and partial fog frame activity, not speculative visibility retention. | **Critical:** Batched accepted motion needs proper private dynamic token/torch vision and per-viewer deltas while the gesture is active; the new batched RPC alone currently does not publish an observer path or update moving-light visibility. Verify stationary NPC appearance and revocation. |
| WP5 Free-tier load & compatibility | One batched network authorization instead of one per cell in collision-enabled drags; one complete straight swept-collision check per piece before per-cell fallback; one canonical final trajectory transaction remains. No paid infrastructure. Existing sheet/inventory/combat/initiative/measurement and map tools remain unmodified. | Measure per-gesture CPU/queries/WAL/recipient fan-out, queue expiry and memory; optimize LOS/lighting cache; reconcile open historical PRs only if genuinely unreleased and approved. |
| WP6 Verification & consolidated release | Added dedicated batched collision/privacy/drag/visual tests; existing CI unit/lint/build/npm audit/Deno checks and staging CodeQL workflow run on this branch. | No actual SQL migration applied or SQL role test, no post-migration integration, no live multi-browser FPS/latency/security QA. Do NOT label release-ready. |

## Staged changes
- `supabase/migrations/20261109000500_batched_concealed_navigation.sql`: additive private-session accounting, new secure batch function, straight-sweep fast path with exact-prefix fallback; **not applied**.
- `src/ConcealedGestureBatch.js`, `src/ConcealedMovementGate.js`, `src/BattlemapBoard.jsx`: bounded secure route, multi-cell gesture requests, final pointer-up drain and revocation guards.
- `src/AuthorizedFractionalMotion.js`, `src/TokenMotionRuntime.js`: permitted sub-cell sprite motion, stable handoff, aggregate frame latency.
- `src/MapFogOverlay.jsx`, `src/useAuthorizedMapFog.js`: aggregate, privacy-preserving dirty-frame and reauthorization counters.
- `tests/unified-movement-batches-2026-11-09.test.mjs`, adapted existing concealed-navigation assertions, and `.github/workflows/codeql.yml` trigger.

## Data and permission contract
`advance_authorized_navigation_gesture_batch(p_session uuid, p_targets jsonb, p_seq bigint) -> jsonb`
- Client targets: array of up to 12 absolute `{dx,dy}` offsets from the **server-originated gesture**, not from arbitrary supplied map coordinates. Per client request: at most 24 swept cells; SQL accepts at most 48 cells.
- Server: `auth.uid()` is mandatory; `FOR UPDATE` locks an actor-owned, not-yet-expired private session. Server verifies campaign/map assignment, token ownership/visibility, character control/values, tool control, scene/environment revision, map rules and permission generation.
- Accepted response: `{version:1,seq,approved:[{dx,dy}...],blocked:boolean}`; no blockers, walls, NPC/character attributes, owner IDs or scene geometry. Neutral null on invalid/revoked requests. Client validates schema, adjacency and expected sequence again.
- `forge_visibility.navigation_gestures` retains RLS and no client table access. New function EXECUTE is explicitly restricted to authenticated/service_role; anonymous role cannot call it. Existing `commit_map_trajectory` still independently validates final saved path and performs atomic group updates.
- **Residual threat:** any exposed movement-response protocol can still be probed by an intentionally malicious controlled client; bounded attempts, per-session limits and sanitized responses reduce exposure but do not prove physical pointer intent. Rate-limit review is mandatory before treating hidden-world privacy as complete.

## Rollout sequence (designer approval required)
1. Before any release: finish WP1–WP6 gaps, validate SQL in a permitted environment and finish a manual multi-client security/performance matrix. Keep everything on THIS coordinated branch.
2. Verify production `main`, migration history, Vercel SHA and current release ledger again; freeze a specific staging commit.
3. Only with explicit approval: apply additive migration `20261109000500`, audit `anon`/authenticated/DM/foreign-player roles and permission-generation invalidation.
4. Only with separate explicit approval: merge this COMPLETE integrated branch once into `main` and make one production Vercel deployment within Free-tier limits.
5. Run the user’s test campaigns across DM, 2/4/8 players; 10/50/100 tokens; 1×1–4×4 bodies; fast out-and-back; groups/tools/torches; conditional secret walls; doors; fog sharing; stationary reappearance; reconnect; malicious unauthorized requests; changed permissions; and SQL/WAL/RSS/swap metrics.
6. If a severe regression occurs, roll back the FRONTEND to `ab905866` or the subsequently verified last-good release first. The old adjacent-step function stays available. Compatible additive SQL objects can remain inert until a controlled DB cleanup; never disable RLS or collision to recover performance. Do not automatically drop private table columns while active sessions exist.

## Baseline / acceptance measurements
Measure both before and after with Chrome/Firefox performance markers, Supabase SQL-stat deltas, WAL activity and dashboard memory:
- local visual pointer-to-RAF p50/p95 in **known authorized** segments; 60 Hz next-frame target (16.7 ms) is aspirational;
- batch count, cells/batch, processing wait, p50/p95 RPC, server denial and revocation;
- observer validated-motion age and route fidelity (<200 ms p95 goal only on healthy tested network);
- token sprite mount/detach deltas and fog canvas full vs dirty paints (zero unexplained routine flashing);
- number of movement RPCs and database writes per 10-cell fast drag, 100-token stress and idle;
- actual process RSS/swap vs Supabase memory **commitment**, distinct metrics.
No current measured browser results justify a claim of 60 FPS or zero flashing.

## Release gate
**BLOCKED:** a successful source-level CI/CodeQL result does not validate unexecuted SQL, actual per-viewer hidden-state safety, observer routes, moving torch vision or multi-user performance. Do not merge, deploy, apply SQL or incur paid charges before the designer's approval.
