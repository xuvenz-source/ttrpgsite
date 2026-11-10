# B03 — World V2 private swept-path validation candidate

**State:** STAGED / NOT INSTALLED. **Date:** 10 November 2026.  
**Developer authorization:** The designer explicitly instructed **“Proceed with B03”** after delegating free-tier engineering decisions. This is a **staging-only** sequencing exception to Gate A for this one microstep, not a release gate waiver. A06 remains **BLOCKED**, Gate A **NOT PASSED**, and PR #71 must still be amended separately.

**Baseline:** Production `main@b246b3a72537b53b2afc2a9a38cbe1db3609a8af`, with draft staged ancestry A03–A06, B01 PR #76, B02 PR #77. No source migrations or active public RPCs were overwritten.

## Deliverables

1. `supabase/candidates/world_v2_b03_path_validation.sql` — **nonapplied SQL candidate**, deliberately outside the repository's normal `supabase/migrations/` directory. Defines only the private function `forge_world_v2.validate_motion_path_batch_b03(uuid,bigint,jsonb,jsonb,bigint,bigint)` and revokes execute permission from `PUBLIC`, `anon`, `authenticated`.
2. `tests/world-v2-b03-path-validator-contract.test.mjs` — *static source and client route-contract checks* for no-write/no-public-RPC behavior, identity, session, revision, path bounds, collision, private attributes and route ordering. Does not execute SQL.
3. This record, the engineering progress tracker and release ledger.

**Deliberately NOT done:** no production/staging Supabase DDL, no new applied migration, no public endpoint, no active `advance_core_v2` replacement, no Realtime changes, no auth grants to browser users, no frontend code changes, no DM test campaign changes, no Vercel deployment.

## Validating logic (candidate semantics)

```text
future trusted advance_core_v2 invocation
  -> actor JWT auth.uid + actor-bound session UUID, sequential p_seq
  -> lock session; check original map/selection/permission/environment and expiry
  -> verify current map footprint bounds + server-authored collision scene
  -> load only frozen selected token/tool footprints and current server attributes
  -> for each requested waypoint (≤8, in order):
        expand exact 8-connected intermediate cells (total ≤24)
        for each candidate cell:
           for each selected piece:
              swept footprint against server-authored walls/door/window
              using the existing forge_world_v2.step_allowed geometry
           accept cell OR stop at immediately preceding legal frontier
  -> PRIVATE result: approved prefix, blocked flag, endpoint,
                     compressed route steps, attempted and accepted counts
  -> NO session update, NO canonical writes, NO realtime.send
```

The private function does not accept a client-provided wall mesh, tool attributes, movement abilities or permission grants. It accepts only session UUID, expected sequence, exact canonical starting coordinate, bounded ordered waypoints and two observed generation values. The corresponding actor/selection/map/ownership and original signed pieces are checked by the **existing** server-side `forge_world_v2.session_valid`; `auth.uid()` and a locked DB row are independently required. `SECURITY INVOKER` prevents the new helper from silently acquiring elevated privileges when directly invoked; the future existing private `advance_core_v2` (`SECURITY DEFINER`, owned by `postgres`) can invoke it under its established protected trust boundary.

### Compatibility and geometry

- **Server source of truth:** The SQL candidate calculates a proposal only. An eventual `advance_core_v2` integration must atomically persist only that validated prefix in `motion_sessions` and keep its existing last-sequence/ack replay semantics. Final canonical `commit_world_motion_v2` must still lock the selected rows, revalidate the **entire** accumulated route and use the existing authenticated checkpoint/trigger scheme. No intermediate canonical position writes.
- **Coordinate expansion:** The same `sign(delta) × floor(abs(delta) × i / steps + 0.5)` half-away-from-zero rule as current SQL/JS. Each adjacent cell is validated individually (including diagonal corners), not just the distant destination. Turns and reversals remain separate in order; only same-direction consecutive step runs are compressed in internal `routeSteps`.
- **Rigid mixed groups:** All 1–48 frozen selected token/tool members move by the same anchor offset. Every intermediate move checks each actor's exact stored `spanX/spanY`, including oversized NPCs and mounts. Any collision halts the **whole group** at the common last safe cell; no partial group writes.
- **Doors and barriers:** Existing published `wall_passes` checks open/broken doors/windows and validated attribute thresholds; `step_allowed` sweeps against segments. `oneWay` is **vision-only** in current World V2 client/server code, so it cannot authorize movement through a solid wall. No invented directional movement shortcut.
- **Scene failure:** A collision-enforced map without a valid object array is **denied immediately**, even if the current legacy `step_allowed` could accidentally skip NULL array iteration. The candidate explicitly caps objects at 120; original validator also restricts segment points to 2–80.
- **Motion quotas:** Maximum 8 waypoint targets and 24 attempted cells per call; 1–48 selected pieces; at most 64 batches / 128 attempted cells per session; original 10-second sliding / 60-second absolute expiry is inherited from `session_valid`. This candidate **does not increase** limits or create more observer emissions.
- **No private disclosure:** The private function returns no wall geometry, actor attributes, or reason for a block. It returns only path/ledger internals for the future private caller. The public `advance_world_motion_v2` response must remain exactly `{version,sessionId,seq,blocked,accepted}`; only the established recipient-filtered Realtime publisher may share authorized paths.

## Security review

| Attack surface | Candidate safeguard | Release verification still required |
|---|---|---|
| Direct authenticated/anonymous function invocation | Private schema plus explicit `REVOKE EXECUTE`; no public wrapper | Query `pg_proc`, `pg_namespace`, `has_function_privilege` after **authorized** isolated install |
| Forged map/token/tool/foreign session | `auth.uid()`, actor-bound session row, map/campaign and ownership via `session_valid` | B04 cross-account calls, altered map, mixed group |
| Stale/duplicate/out-of-order advance | `p_seq=s.last_seq+1`, revision/permission match, current session status and expiry | B04 replay with same/different payload; old ack never rebroadcasts |
| Wall/closed door, corner leap | Per-intermediate-cell `step_allowed` swept collision and server scene; first invalid stops entire group | B04 PostgreSQL movement matrix, closed/open state changes |
| Missing/malformed collision scene | Explicit `scene IS NULL` and object-array type/size gates | B04 delete/unpublish/change scenario **in rollback-only local fixture** |
| Oversized token, mount, cross-map | Stored per-piece footprints, map/grid bounds, original offsets | B04 footprint and group fixtures |
| Bypassing DM override | Can only inherit server-recorded DM override with renewed campaign-DM check | B04 player forcing override negative |
| Leaking hidden NPC or wall metadata | No client geometry inputs, no actor attributes in result, no public EXECUTE | B04 SQL + observer per-viewer LOS tests |
| State update race / duplicate final commit | No writes in helper; existing core + final commit checks remain | B04/B08 concurrency, checkpoint, ack loss |
| Free-tier CPU pressure | Finite actor/step/bend/object limits; piece attributes queried once/batch | B04 benchmark number of selected members, objects, rays at real fixture sizes |

**Important limitation:** Static regex tests **cannot** prove PL/pgSQL compiles or executes correctly. The B03 SQL is uncompiled against live Postgres and untested with true JWT/RLS session contexts. It is therefore **not releasable**. B04 must run a complete isolated database setup (including eight V2 migrations) or a fully safe transaction-rollback fixture with explicit authorization, compilation, SQL parameterized adversarial cases, and audit grants. No user-facing movement improvement has happened yet.

### B04 integration notes (not implemented here)

- In an **isolated local database**, install base V2 schema, then candidate SQL. Call the private function only from a trusted owner inside an authenticated fixture transaction, never from an anonymous public API.
- Check an eligible player positive path, foreign selected token/tool denial, DM override denial for a player, stale generation, replay/sequence conflict, diagonal/door/wall/oversized-group blocked prefixes, missing scene and scene revision change. Confirm `map_tokens`, `campaign_tool_issues`, `motion_sessions`, `viewer_streams`, and `realtime.messages` remain **unchanged** by the validator.
- Confirm exact accepted cell expansion against `GesturePath.expandGestureRoute`, including diagonals, sign symmetry, turns and reversals. The candidate's `routeSteps` is **private** state for future `advance_core_v2`, not client data.
- Add a future versioned safe integration into `advance_core_v2` only after B04 has proven equivalence (including blocked-first-cell, partial prefix and existing reply/retry semantics). Avoid duplicating `realtime.send`, changing the public API or weakening final `commit_world_motion_v2`. B05 may then select flush cadence; B06 independently implements server-certified prediction envelope and B07 recipient budget.
- A final release needs PR #71 amendment, Gate A authenticated DM/P1/P2 performance and security, integrated CI/CodeQL, migration order, security grants, B10 QA and a separate release decision.

## Source evidence

Repository: `src/engine/v2/GesturePath.js`, `CollisionSolver.js`, `PredictionGrants.js`, `AuthorityClient.js`, `RealtimeTransport.js`; `supabase/migrations/20261109095000_world_engine_v2_motion_authority.sql`, `20261109100000_world_engine_v2_private_observer_stream.sql`, B01/B02 architecture records.

Read-only live Supabase inspection, 10 November 2026: project `lwhwgqaunxbmvyndswze` `ACTIVE_HEALTHY`, PostgreSQL 17, **83 applied migrations**, installed `forge_world_v2.advance_core_v2` = `SECURITY DEFINER` / `VOLATILE` / empty search path; `session_valid` = `SECURITY DEFINER` / `STABLE` / empty search path; `step_allowed` = `SECURITY INVOKER` / `STABLE` / empty search path. No write query or DDL was executed.

Supabase documentation: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Securing API grants](https://supabase.com/docs/guides/api/securing-your-api). Official docs note that function-level EXECUTE grants and role semantics must be audited independently of RLS.

**Next microstep:** B04, hostile-authority regression suite and PostgreSQL execution checks. A06/Gate A is still a release blocker; no approval for live SQL or production changes.
