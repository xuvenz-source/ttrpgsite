# R18-136 — Isolated V3 signed topic API without unfreezing legacy public API

**20 November 2026, Melbourne.** Source-only direct child of fully green R18-135 draft PR #243, commit `252d5fcc582eb280159728aea97bb5a36ff6e960`. **NO_GO:** no production or hosted QA SQL, new versioned migration, frontend `src/` edit, merge, deployment or paid resource.

## Verified original API privilege boundary (read-only SQL)

The original Supabase still has 83 applied migrations. QA has zero migrations and zero public application tables. On the original, `authenticated` currently has USAGE on `public`, EXECUTE on 77 `public` functions, including **67 SECURITY DEFINER functions**, SELECT on 29 public relations, INSERT on 20, UPDATE on 20 and DELETE on 18. The original public total inspected was 31 tables/views. This proves the existing R18-128 (R128) maintenance freeze is deliberately disruptive: it revokes `public` USAGE for authenticated and anonymous callers. Undoing the revoke without full ACL/semantic audit risks restoring pre-existing callable RPCs and direct data routes. A client-provided `v3` label or bundle version is not signed permission and cannot distinguish a legitimate browser from a modified legacy client.

Supabase's current [Using Custom Schemas](https://supabase.com/docs/guides/api/using-custom-schemas) and [Securing your API](https://supabase.com/docs/guides/api/securing-your-api) documentation distinguish database GRANTs from the Data API **Exposed schemas** setting. A newly created schema must be independently listed under the project's Data API configuration; `GRANT USAGE` alone is not PostgREST exposure. We explicitly **do not** apply the broad example `GRANT ALL` permissions to the new schema: the R136 attack surface is one RPC only.

## Staged, UNAPPLIED PostgreSQL 17 contract

`staging/world-v2-b10-r18-136-v3-isolated-api-fence/unapplied-v3-api-bridge-after-r128.sql`:

- Must run in disposable PG17 **after** fictional R125 recipient epochs/R126 private scene setup and R128 `public` schema freeze. A preflight rejects installation if either `anon` or `authenticated` can still use `public`, if the R125 topic authority is missing, **or if the old R126-retired shared V2 scene receive policy is still installed**. The disposable runner deliberately reinstates that old policy as a negative control, proves rejection, then removes it before testing R136.
- Creates private `forge_v3_api`, with **USAGE only to authenticated**, and exactly one executable routine: `forge_v3_api.get_authorized_scene_channel_v3(p_map uuid)`. No tables/views or schema-wide/default routine grants are created.
- The narrow `SECURITY DEFINER SET search_path=''` wrapper checks signed `auth.uid()`, then calls the original R125 `public.get_authorized_scene_channel_v3` internally. That function already checks *current* campaign membership and map assignment using signed Postgres identity and `FOR SHARE` membership ordering before returning the actor's own opaque epoch topic. The wrapper validates the exact returned map/user/epoch topic and never trusts a client-supplied user, campaign or protocol version.
- The wrapper does not grant `public` USAGE back to any browser role, and returns NULL on missing/removed/off-map membership. It cannot itself authorize fog, tokens, character sheets, movement, Storage, observer feeds, or an entire scene.
- A postflight confirms schema permission isolation and rejects a mismatched grant. There is **no automatic rollback to V2** and no production unseal operation.

The companion dormant `IsolatedV3TopicClient.mjs` requests `db.schema('forge_v3_api').rpc('get_authorized_scene_channel_v3',{p_map})` only after `auth.getUser()` verifies the expected actor. It checks map/user/epoch formatting and cancellation/context staleness. **It never calls `db.rpc` or otherwise falls back to public.** An R126/R135 application would need an explicit approved adapter integration; no live import exists.

## Synthetic verification: positive and negative tests

The isolated PG17 runner installs R125 synthetic members and R126 mock Realtime; creates R128 fictional legacy sheet and movement APIs; installs R125/R126 private scene prototypes; demonstrates R136 candidate installation **fails before R128**; installs R128 unmodified maintenance freeze; then installs R136 and validates:

1. Direct `public` V2 movement and sheet RPCs, direct owner-sheet reads, and even the old `public.get_authorized_scene_channel_v3` fail for `authenticated` due to the revoked schema.
2. The **only** new V3 gateway routine remains callable by a signed current P2 member and DM, each obtaining their own V3 epoch. Outsider, null actor and null-map requests receive no topic.
3. P2 reassignment to another map causes old-map topic denial. Removal causes denial; reinstatement creates a **new** epoch, without reopening `public`.
4. Anonymous callers cannot access the isolated schema. The bridge exposes zero tables/views, grants no additional RPC functions, and leaves the old schema USAGE denied.
5. Source-only client tests verify custom-schema routing, no fallback, identity mismatch and late-response cancellation.

A PostgreSQL test does **not** prove the schema is exposed over hosted PostgREST, that real signed users can reach it, or that the provider's existing WebSocket channels stop receiving data. This package deliberately does not touch hosted Data API config or any hosted SQL.

## Hard security boundary still missing

**One topic RPC is not an operational V3 gameplay API.** R128's `public` freeze still blocks the actual scene/sight/observer/character/movement APIs and direct data reads currently needed by Tabletop Forge. A separate route inventory, least-privilege V3 schema surface, actor/LOS/security reviews, and real signed QA are required *before* any public schema change or server unseal. Introducing this bridge alone would keep a live client largely nonfunctional.

Other blockers: R123/R131 synchronous masking and listener teardown unmounted; R125/R126/R132/R133/R134 source-only SQL and R135 observer client unmounted; original 67 public SECURITY DEFINER RPCs and 83 historic migrations not fully audited; 19 Postgres Changes handlers over 17 tables, unreviewed external/Edge/client Broadcast, already-connected old Realtime sockets and queued packets, service_role escapes, Storage signed bearer URLs (#231), and real DM/P1/P2/outsider/revoke/reinstatement movement/collision/fog/LOS and free-tier performance tests. Issues #220/#223/#229/#231 remain.

**Next R18-137:** inventory all required V3 browser-facing RPCs and direct table dependencies, design a complete isolated schema/API with explicit endpoint-level privileges, and verify PostgREST exposure readiness without touching the hosted project. Do not accept a client version flag as an access control and never grant blanket `public` USAGE as a workaround.

**Manual action:** none required now. A future authorized hosted QA rehearsal will need a separately approved Data API exposure for `forge_v3_api`, but this step does not request it. **PRODUCTION NO_GO.**
