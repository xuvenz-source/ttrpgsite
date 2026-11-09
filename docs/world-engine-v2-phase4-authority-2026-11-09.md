# World Engine V2 — Phase 4 Authoritative Movement Engineering Ledger

**Date:** 2026-11-09  
**Branch:** `stage/world-engine-v2-2026-11-09`  
**Review PR:** #58, **draft**, staging only  
**Migration status:** staged in GitHub, **NOT applied** to TTRPG Site Supabase  
**Deployment status:** No Vercel/main merge, no live client cutover  
**Goal:** A clean V2 server-owned movement authority that Phase 2 client and Phase 3 collision preflight can call without importing or invoking the former movement RPCs.

## 1. Verified baseline / design choices

Read-only production Supabase inspection confirmed:
- PostgreSQL 17.11 in the existing free-tier project.
- Existing `public.map_tokens`, `public.campaign_tool_issues`, `public.map_environments`, map visibility permissions and `forge_visibility.navigation_permission_generations`.
- Legacy movement and wall/trajectory trigger functions, with current hard collision enforcement and old transaction-scoped route validation.
- Existing identity contract: `auth.uid()`, campaign map assignment through `public.can_view_campaign_map`, DM role through `public.is_campaign_dm`, token ownership and character linkage, party-shared tool control, released vs held tools, published scene and permission generations.

**Important boundary:** This phase introduces V2-specific movement RPCs and a private, short-lived session schema. It does not yet replace V1 direct-write collision triggers, observer/fog broadcasting, or V1 frontend. The release gate still requires all of those to be replaced and retired, not left active.

## 2. Implemented source artifacts

- `src/engine/v2/AuthorityClient.js` — strict V2-only transport. Validates UUIDs, selection, coordinates, ordered local sequences, environment/permission stamps, and explicit DM collision bypass requests. No player-authored Realtime broadcasts and **no fallback** to legacy RPCs.
- `src/engine/v2/MovementController.js` — existing Phase 2 controller now forwards explicit `collisionOverride` on session begin, and enforces the server's max-48 selection bound.
- `src/engine/v2/index.js` — V2-only public authority client export.
- `supabase/migrations/20261109095000_world_engine_v2_motion_authority.sql` — **proposed/unapplied** backend schema, helpers, V2 begin/advance/commit/cancel RPC family and exact role grants.
- `tests/world-engine-v2-phase4.test.mjs` — client authority isolation, sequence, cancellation, integration and explicit override tests.
- `tests/sql/world-engine-v2-authority-fixture.sql` and `tests/sql/world-engine-v2-authority-contract.sql` — synthetic PostgreSQL 17 actor, wall, group, role, replay, grant and revocation fixtures.
- `.github/workflows/staging-world-engine-v2-sql.yml` — disposable PostgreSQL fixture CI. This workflow never connects to a real Supabase project.

## 3. Protocol contract

### begin_world_motion_v2
Inputs: `p_map`, `p_selection`, `p_origin`, `p_mode`, `p_environment_revision`, `p_permission_generation`, optional `p_collision_override=false`.  
Returns only `{version:2,sessionId}` or neutral failure.

The server verifies actor identity from `auth.uid()`, actual campaign/map assignment and role, token/tool ownership, held tools, character ownership and current positions/footprints. It retains private authoritative start positions and version stamps. Only the DM can explicitly opt into collision override. Player movement does not implicitly bypass walls. Only one active session per actor/map is retained; expired sessions are cleaned at subsequent gestures.

### advance_world_motion_v2
Inputs: `p_session`, `p_seq`, `p_from`, bounded `p_targets`, environment/permission revisions.  
Response: `{version:2,sessionId,seq,blocked,accepted:[{x,y}...]}`.

The server locks its own actor-scoped session and rechecks map assignment, role, ownership, original canonical piece state, published environment, rules stamp and permission generation. Client targets are untrusted. It expands each bend into adjacent cells with deterministic rounding and checks each selected piece's full swept footprint against all authoritative barriers. Denials return only a sanitized prefix and generic `blocked` flag. Duplicates replay only when authorization is still valid. Older or future sequence numbers are refused.

Limits: 8 targets / 24 attempted cells per batch, 128 attempted cells and 64 batches per session, 60-second absolute session bound and 10-second inactivity expiry. Player session starts are bounded to 120 per actor/map/minute. No per-frame canonical writes.

### commit_world_motion_v2
Inputs: `p_session`, `p_seq`, `p_endpoint`, environment/permission revisions.  
Response: `{version:2,sessionId,seq,endpoint}`.

Re-lock selected canonical piece rows in stable ID order. Re-check current rights and revisions and independently re-sweep the complete stored accepted trajectory against currently authorized geometry. Commit selected token and tool coordinates atomically. The endpoint must equal the approved path. Store the last commit reply briefly for idempotent retries under still-current map/permission access.

**Temporary compatibility bridge:** The current production trigger contract relies on transaction-local `forge.trajectory_steps`, `forge.trajectory_map` and `forge.trajectory_actor`. The V2 commit uses these only while the old collision triggers remain installed. It independently validates every route leg first. **Phase 10 MUST replace the old trigger dependency and remove these GUC calls before the final integrated cutover.** A V2 release retaining the bridge permanently fails the zero-legacy-remnants acceptance criterion.

### cancel_world_motion_v2
Only an authenticated actor can cancel that same actor's active session. No map geometry or token attributes leave the server.

## 4. Database security

- All private V2 session and rate-budget tables have RLS enabled and explicit `REVOKE ALL` from `PUBLIC`, `anon` and `authenticated`.
- Private helper functions are not client executable.
- Exposed V2 RPCs are `SECURITY DEFINER` with pinned empty `search_path`, narrowly granted `EXECUTE` to `authenticated` only and strict in-function actor/map/piece checks on each privileged operation.
- No client-supplied actor ID is trusted; private wall/NPC data and blocker identities are not in responses.
- The V2 collision solver checks every mixed token/tool member at each accepted step; final persistence is one transaction, not an independent write per tile.
- Permission, map or scene revisions invalidate in-progress motion.
- Direct table writes remain protected by the **existing** production RLS/trigger mechanisms until the final cutover. Phase 10 must provide equivalent or stronger V2 direct-write trigger protections and verify role probes before retiring V1.
- Signed-in malicious clients can still attempt movement-based geometry probing; bounded sessions and sanitized responses constrain but cannot mathematically eliminate all inference.

## 5. Tests and release gates

Disposable PostgreSQL 17 fixture tests include:
- SQL syntax/apply and role grants;
- actor-only begin, begin replay/duplicate protection;
- foreign token denial, shared-tool control and mixed-group commit;
- high-speed hidden wall crossing denied at the last valid cell without disclosing blocker ID;
- player override denied, explicit DM override permitted;
- duplicate ACK/commit idempotency and out-of-order sequence refusal;
- foreign actor replay/cancel denied;
- permission revocation blocks both new movement and previously approved-prefix replay;
- synthetic direct-write guard.

GitHub Node tests cover client transport validation, session disposal, ordering, bounded segments, integration with the Phase 2 controller and no old RPC usage. Repository CI also performs critical lint, full unit tests, Vite build, dependency audit, Deno checks and CodeQL.

**Not yet proved:** True production PostgreSQL RLS on V2 RPCs; real browser latency/p95; fog visibility and observer transport during in-flight sessions; exact migration application against production's complete function/trigger graph; 2/4/8-client stress and WAL/RSS. Those are later integrated acceptance requirements, not successful Phase 4 claims.

## 6. Free-tier constraints and mandatory follow-on work

- No Redis, paid game server, new database project or per-frame SQL writes.
- Session tables are private and bounded; time-based cleanup occurs opportunistically on begin, with additional retention review during Phase 5 load profiling.
- Live region/server RTT can still affect unseen-wall traversal; only known authorized geometry can be locally predicted.
- Phase 5 must implement recipient-scoped, server-approved motion paths; Phase 6 static scene caching; Phase 7 viewer fog and moving light deltas; Phase 8 stable rendering; Phase 9 integration; Phase 10 final old SQL/function/trigger/grant and frontend-remnant retirement.
- Do **not** merge or deploy this SQL yet. Keep PR #58 draft; coordinate one final database+frontend release only after end-to-end tests and explicit approval.

**Phase 4 completion means isolated server protocol and fixture checks are green. It does not mean live movement has switched to V2.**
