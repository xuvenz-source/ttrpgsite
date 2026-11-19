# R18-128 — Hard-maintenance database denial, scene quiescence and bypass audit

**19 November 2026 — Australia/Melbourne.** Direct source-only child of draft PR #235 at `fbc470e3ec54972ba17600ab0fc5a0ea06d2e3b2`. **Production NO-GO.** This document describes a fabricated PostgreSQL 17 isolation experiment, NOT a live database migration, actual server-side total fence or deployable V3 switch.

## Verified live original baseline (read-only SQL only)

- The original Supabase database retains **83 migrations** and a live legacy `World V2 scene publication receive` policy. R125/R126 V3 receive policy and V3 authorization RPC remain absent. QA retains **0 migrations and 0 application tables**.
- There are **67 callable public SECURITY DEFINER functions** accessible to the authenticated database role. Text scans found 26 functions referring to `can_view_campaign_map`, 16 to `is_campaign_member`, 43 to `is_campaign_dm`, and 12 referring directly to `campaign_members`. Those counts overlap. **15 contain none of those four textual checks.** This is an investigation queue, not evidence all 15 are vulnerable; several may invoke guarded functions transitively, such as V2 movement and fog routines.
- Original `can_view_campaign_map`, `is_campaign_member` and `is_campaign_dm` are SECURITY DEFINER access helpers used by many public RLS policies. The original `can_edit_campaign_sheet` has the revoked character-owner gap identified in R18-115/R18-124. Owner-only `personal_tokens` and `tabletop_user_preferences` policies do not refer to campaign membership because they are user-wide resources. A blanket campaign-scoped helper replacement cannot deny all possible public APIs.
- PostgreSQL RLS policies do not automatically constrain owner-executed SECURITY DEFINER functions. Direct membership scans are not sufficient to prove universal denial. The actual end-to-end entrypoint graph and all relevant database service/Realtime channels still need review.

## Proposed disruptive maintenance circuit — UNAPPLIED

The staged source `staging/world-v2-b10-r18-128-server-maintenance-fence/unapplied-maintenance-freeze-candidate.sql` is explicitly a **deny-all maintenance mode** for PostgreSQL public-schema callers, not a per-account or protocol-version authorization system.

Inside a single transaction it takes an ACCESS EXCLUSIVE lock on the existing `forge_world_v2.scene_publications` counter to serialize this **specific scene sender** against already-running counter writers. It replaces `forge_world_v2.bump_scene_publication_v2(uuid)` with a counter-preserving function that **does not call realtime.send**. It then revokes `USAGE` on `public` from PUBLIC, anon and authenticated. As long as this restrictive grant state persists, ordinary old browser requests to public tables and functions, including publicly exposed SECURITY DEFINER RPCs, should be denied by PostgreSQL's schema permission check, regardless of a previously valid signed session.

This deliberately blocks **both V2 and any future V3 public APIs** until a separate, security-reviewed unseal plan exists. It does **not** include any GRANT restoring public usage or re-enabling map-wide V2 scene broadcasts. Because it is so disruptive, do **not** apply it to original or hosted QA in its current form.

The migration candidate has not been checked against all 83 original private migration bodies or deployed services, does not resolve role/group grants or external gateway authorizations, and is not an end-to-end server hard fence. The future release must develop and test a safe, auditable restoration of *only* V3-capable paths with a real server-side gate for old clients. A mere browser version string or self-declared header cannot constitute authorization.

## Exact isolated PostgreSQL 17 experiment

Synthetic signed P1 starts with a valid JWT claim. A fake owner-controlled sheet has an authenticated RLS SELECT, and fake public SECURITY DEFINER sheet and movement RPCs are callable. A fake V2 scene sender emits one legacy scene-revision event and increments the existing generation counter.

After **only in disposable PostgreSQL** installing the R128 candidate:

1. New calls to old public sheet RPC, movement RPC, direct owned sheet, unauthenticated campaign table and public map helper must fail with a schema-level denial.
2. The old signed actor identity is unchanged in the simulation; the denial is server-authoritative, not an instruction to the UI or a token expiration.
3. The scene-generation counter can still advance from the trusted trigger context while no *new* event is emitted by this one legacy scene sender.
4. A synthetic, deliberately exposed **private-schema SECURITY DEFINER** test function can still read the fake data. This proves the candidate is **not a universal RPC fence**.
5. The old synthetic `realtime.messages` receiver can still see the old, already-recorded message. It is a teaching fixture, **not** an actual hosted WebSocket test. It proves we cannot equate public schema REVOKEs with removal of already-authorized channels.

This design expressly demonstrates both its narrow strength and its remaining critical exposure surfaces. No risk should be marked resolved solely because the five public API denials pass.

## Blocking issues, operational safety and next gates

**R18-129 recommended next task:** enumerate every live privileged callable path and Realtime/Storage/Postgres Changes publisher that might bypass the public schema, including private schemas, server jobs, triggers, direct owner policies, service_role privileged paths, membership identity updates and in-flight transactions. Stage bounded route-specific server checks and deny old clients *without* permanently denying newly verified V3 traffic. Verify proper R123 synchronized mask/unmount and R125/R126 recipient epoch rollout in real signed QA, then measure transaction locks, Realtime egress and movement/fog rendering on free-tier infrastructure.

A source-only candidate cannot disconnect old Realtime sockets, invalidate previously minted Storage signed URLs (issue #231), retroactively erase already-delivered scene data, or guarantee that an in-flight transaction started before the maintenance lock is stopped. Existing movement, collision, fog and sheet security gates remain mandatory. In particular, do not add a new authorization request to every movement, drag, frame or fog redraw.

Outstanding blockers: #220, #223, #229, #231; R18-104 fog metadata; R18-114 UUID inventory; complete 67-function and 83-private-migration reviews; real signed DM/P1/P2/outsider testing; safe rollback proof and a budgeted maintenance cutover. Restore no old V2 shared scene publishing merely to recover availability.

**Manual work now: none. No database, frontend, deployment or production change. Release decision: NO-GO.**
