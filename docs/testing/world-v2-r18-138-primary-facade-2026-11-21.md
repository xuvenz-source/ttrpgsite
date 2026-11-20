# B10-R18-138 — Dynamic route classification and seven closed V3 world API facade functions

**21 November 2026, Melbourne.** Source-only child of fully green R18-137 PR #245, SHA `1243cb822efadc85c65b20bc6513be237e757fc4`. **NO_GO** for hosted original/QA SQL, Data API settings, merging, deployments and paid resources.

## All 26 dynamic source references, not 26 approved routes

R18-137's original lexical census identified 26 dynamic calls across browser modules. R18-138 reconstructs the **exact source file, line, expression and dynamic target** using `DynamicRouteReview.mjs` and pins a source-derived classification for each. Its CI test fails if any of those 26 is missing, newly added or removed without an explicit ledger amendment.

The 26 include:

- Four indirect or variable RPC call sites: `AuthorityClient.js` (motion begin/advance/commit/cancel, plus optional finalize missing from the original database), `VisibilityController.js` (own visibility and DM preview), `useAuthorizedMapLights.js` (two light-mask protocol variants) and `useMapCombat.js` (DM combat operations).
- **One dynamic inventory relation**: `useCampaignSheetInventory.js` limits `target.table` through the `sources` mapping to `characters`, `npc_templates` and `map_tokens`; the latter lacks the original authenticated table-level SELECT grant. The source shape does not prove the user is an authorized owner/DM.
- Six dynamic Storage bucket call sites from `PersonalTokenLibrary.jsx` and `SignedAssetUrls.js`: fixed library buckets (`personal-token-art`, `tabletop-artwork`) and a caller-provided signed URL bucket. Three original Storage buckets are private, but preissued bearer URLs can survive campaign revocation (#231).
- The remaining **15 dynamic channel constructions**, including legacy V2 per-user observers, shared scene topics, campaign chat/roster/routing, DM handouts, initiative, inventory leases, tools, viewer fog Postgres Changes and campaign Presence. Distinct Postgres Changes, Broadcast, Presence, and signed Storage boundaries are not secured by exposing a V3 PostgREST schema.

Every classification is `SOURCE_CLASSIFIED_NO_AUTHORIZATION` and `safeToExpose:false`, with no synthetic permission promotion. A lexical scanner cannot prove transitive ownership, client reachability, signed user/DM identity, Realtime live socket revocation, or safe private row projections. The 26 are **source-classified**, not security-cleared.

## First seven source-only V3 world facade prototypes — all EXECUTE-REVOKED

The file `unapplied-closed-world-v3-facade.sql` adds seven functions to the **existing, still-unapplied R136 `forge_v3_api` schema**:

| V3 facade | Delegated existing original |
| --- | --- |
| `get_authorized_world_scene_v3(map)` | `get_world_scene_v2(map)` |
| `get_authorized_world_sight_v3(map)` | `get_world_visibility_v2(map)` |
| `get_authorized_world_cursor_v3(map)` | `get_world_observer_cursor_v2(map)` |
| `begin_world_motion_v3(...)` | `begin_world_motion_v2(...)` |
| `advance_world_motion_v3(...)` | `advance_world_motion_v2(...)` |
| `commit_world_motion_v3(...)` | `commit_world_motion_v2(...)` |
| `cancel_world_motion_v3(session)` | `cancel_world_motion_v2(session)` |

The original live functions were read on the original Supabase project and retain the signed `auth.uid()` actor, map, ownership, movement session sequence, permission generation, collision and LOS logic. R18-138 does **not** recreate the 83 original migrations or replace that logic; tests use separate clearly fictional PG17 substitutes.

The prototype preflight requires R128's `public` schema USAGE freeze, R136's one signed V3 topic RPC, R132's transaction-held publication gate, and retirement of the old shared V2 scene receive policy. Any mismatch aborts installation. All seven privileged implementations are **`SECURITY DEFINER SET search_path=''` helpers in the new non-exposed `forge_v3_internal` schema**. The seven `forge_v3_api` functions are instead **`SECURITY INVOKER` forwarding stubs**, which are also EXECUTE-revoked. The private helpers have neither schema USAGE nor EXECUTE granted to browser roles. This follows current [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security), which explicitly advises against placing privileged definer routines in an exposed Data API schema. The **standalone R136 parent** still places its topic definer in an exposed schema. This R138 child **explicitly repairs that inherited function** by relocating the identical signed-user topic logic to a private definer and replacing its exposed function with a `SECURITY INVOKER` forwarding shim. Only that existing signed topic helper receives narrowly scoped `authenticated` USAGE/EXECUTE on the private schema/function; the seven new gameplay helpers remain completely ungranted. **R136 must never be deployed alone**, and this stacked prototype still has no hosted approval or complete gameplay access. No broad public grants, direct table reads, default role privileges or enabled live imports are introduced. R136's existing topic RPC remains the only proposed authenticated-callable gateway.

The scene, sight, cursor and movement *begin* functions demand a current R125 recipient-scoped V3 map topic and server maintenance mode `v3-only`. Scene responses retain the original compatible `version:2` payload (transport protocol V3 is distinct from the already validated viewer payload shape). A player cannot receive raw `environment` scene geometry; sight must contain a signed actor's map/viewer and validated array fields. Movement advance and commit still call the **original** server functions, preserving their actor-owned, signed session/collision and sequence authorization instead of writing a second movement engine.

A **single server-side R132 maintenance check and transaction-level row lock** was added to each existing advance/commit RPC. There are **zero additional browser/network RPCs per movement or frame** in the candidate, but the row lock can add database contention on the free tier; no real latency/performance or signed multi-user measurement has been done, so this package is not ready to enable. Safe cancellation of the signed actor's own session remains possible while fenced.

## Disposable PostgreSQL 17 verification

The proposed isolated PG17 runner bootstraps fictional R125/R126 user/map/Reatime data, R128 public API freeze, R136 single signed V3 RPC, R132 private publication gate and *fictional stand-ins* for the seven original V2 functions; it compiles all R138 facade definitions. It requires a loopback-only disposable database, rejects hosted credentials and confirms no browser role can invoke any of the seven new facades. A separately rolled-back temporary grant exercises signed `authenticated` invocation through a narrow exposed invoker stub and its private definer helper without persisting either privilege.

Tests cover default fenced denial, authorized P2 private scene/sight/cursor, DM-only raw environment, denied cross-campaign map, original-compatible begin/advance/commit reply shapes, no new motion when the trusted gate is fenced, and safe own-session cancellation. They do not execute the real original SQL's collision geometry, LOS engine, fog occlusion, realtime socket authorization or full schema. A successful result is a **scoped design/compilation proof only**.

## Remaining NO_GO / R18-139 handoff

Original project `lwhwgqaunxbmvyndswze` remains at **83 migrations**, with its R128 freeze/R136 gateway **unapplied**. QA `bgydsamxypjslergfpla` remains at **zero migrations and zero public tables**. The R137 snapshot contains **77 authenticated-callable public functions, 67 SECURITY DEFINER routines, 31 public relations, 17 Realtime-published tables and three private Storage buckets**. Other browser APIs remain unavailable under R128, 19 Postgres Changes listener call sites are not migrated, and other Broadcast/Presence/Edge publishers, Storage signed bearer URLs and service-role bypasses remain unresolved.

**R18-139** should test each source-classified dynamic route against an actual producer/call graph and signed user/DM scope, build a complete least-privilege V3 facade for necessary scene/sight/movement and fog routes, measure the R132 lock/fanout overhead under rapid drag/arrow movement, and verify real DM/P1/P2/outsider/revoked/reinstated old-socket and client teardown behavior. Do not grant these seven facades executable access based on PG17 results. All 67 privileged SQL functions, 83 original migrations, existing issues #220/#223/#229/#231 and R127's signed human release gate remain open.

**No manual task now. No live changes. Production NO_GO.**
